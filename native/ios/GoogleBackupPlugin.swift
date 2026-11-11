import Capacitor
import Foundation
import GoogleSignIn
import UIKit

// Copy into the app target when an iOS Capacitor project is created.
// OAuth tokens remain inside the native layer; only backup JSON reaches the web layer.
@objc(GoogleBackupPlugin)
public class GoogleBackupPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GoogleBackupPlugin"
    public let jsName = "GoogleBackup"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listBackups", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "uploadBackup", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "downloadBackup", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signOut", returnType: CAPPluginReturnPromise)
    ]

    private let driveScope = "https://www.googleapis.com/auth/drive.appdata"
    private let maxBackupBytes = 5_000_000
    private lazy var session = URLSession(configuration: .ephemeral)

    private enum BackupError: LocalizedError {
        case missingConfiguration
        case noPresentationContext
        case notSignedIn
        case missingDrivePermission
        case invalidBackup
        case invalidFileId
        case invalidResponse
        case responseTooLarge
        case http(Int)

        var errorDescription: String? {
            switch self {
            case .missingConfiguration: return "Google Sign-In needs an iOS OAuth client ID."
            case .noPresentationContext: return "Google Sign-In cannot open on this screen."
            case .notSignedIn: return "Connect a Google account first."
            case .missingDrivePermission: return "Google Drive backup permission was not granted."
            case .invalidBackup: return "The SciRun backup is empty or too large."
            case .invalidFileId: return "The Google Drive backup ID is invalid."
            case .invalidResponse: return "Google Drive returned an invalid response."
            case .responseTooLarge: return "Google Drive returned more data than SciRun can accept."
            case .http(let status): return "Google Drive request failed (HTTP \(status))."
            }
        }
    }

    private func perform(_ call: CAPPluginCall, _ operation: @escaping () async throws -> [String: Any]) {
        Task { @MainActor in
            do {
                call.resolve(try await operation())
            } catch {
                call.reject(error.localizedDescription, nil, error)
            }
        }
    }

    private func account(_ user: GIDGoogleUser) throws -> [String: Any] {
        guard let accountId = user.userID, !accountId.isEmpty else { throw BackupError.invalidResponse }
        return [
            "email": user.profile?.email ?? "",
            "displayName": user.profile?.name ?? "",
            "accountId": accountId
        ]
    }

    private func hasDrivePermission(_ user: GIDGoogleUser) -> Bool {
        user.grantedScopes?.contains(driveScope) == true
    }

    private func restoredUser() async -> GIDGoogleUser? {
        if let user = GIDSignIn.sharedInstance.currentUser { return user }
        guard GIDSignIn.sharedInstance.hasPreviousSignIn() else { return nil }
        return try? await GIDSignIn.sharedInstance.restorePreviousSignIn()
    }

    private func authorizedToken() async throws -> String {
        guard let user = await restoredUser() else { throw BackupError.notSignedIn }
        guard hasDrivePermission(user) else { throw BackupError.missingDrivePermission }
        let refreshed = try await user.refreshTokensIfNeeded()
        return refreshed.accessToken.tokenString
    }

    @objc public func signIn(_ call: CAPPluginCall) {
        perform(call) { [self] in
            // serverClientId is accepted for parity with Android; direct iOS Drive access
            // uses GIDClientID from Info.plist and does not need a backend client ID.
            guard let clientId = Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String,
                  !clientId.isEmpty else { throw BackupError.missingConfiguration }
            guard let presenting = bridge?.viewController else { throw BackupError.noPresentationContext }

            let user: GIDGoogleUser
            if let existing = await restoredUser() {
                if hasDrivePermission(existing) {
                    user = existing
                } else {
                    user = try await existing.addScopes([driveScope], presenting: presenting).user
                }
            } else {
                user = try await GIDSignIn.sharedInstance.signIn(
                    withPresenting: presenting,
                    hint: nil,
                    additionalScopes: [driveScope]
                ).user
            }
            guard hasDrivePermission(user) else { throw BackupError.missingDrivePermission }
            return try account(user)
        }
    }

    @objc public func getStatus(_ call: CAPPluginCall) {
        perform(call) { [self] in
            guard let user = await restoredUser(), hasDrivePermission(user) else {
                return ["signedIn": false]
            }
            let identity = try account(user)
            return [
                "signedIn": true,
                "email": identity["email"] ?? "",
                "displayName": identity["displayName"] ?? "",
                "accountId": identity["accountId"] ?? ""
            ]
        }
    }

    @objc public func signOut(_ call: CAPPluginCall) {
        perform(call) {
            GIDSignIn.sharedInstance.signOut()
            return [:]
        }
    }

    private func driveRequest(_ url: URL, method: String, token: String, body: Data? = nil,
                              contentType: String? = nil) -> URLRequest {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        if let contentType { request.setValue(contentType, forHTTPHeaderField: "Content-Type") }
        if let body { request.setValue(String(body.count), forHTTPHeaderField: "Content-Length") }
        request.httpBody = body
        return request
    }

    private func send(_ request: URLRequest, maxBytes: Int = 1_000_000) async throws -> Data {
        let (bytes, response) = try await session.bytes(for: request)
        guard let http = response as? HTTPURLResponse else { throw BackupError.invalidResponse }
        guard (200...299).contains(http.statusCode) else { throw BackupError.http(http.statusCode) }
        if response.expectedContentLength > Int64(maxBytes) { throw BackupError.responseTooLarge }
        var data = Data()
        if response.expectedContentLength > 0 {
            data.reserveCapacity(Int(response.expectedContentLength))
        }
        for try await byte in bytes {
            if data.count >= maxBytes { throw BackupError.responseTooLarge }
            data.append(byte)
        }
        return data
    }

    private func object(from data: Data) throws -> [String: Any] {
        guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw BackupError.invalidResponse
        }
        return value
    }

    @objc public func listBackups(_ call: CAPPluginCall) {
        perform(call) { [self] in
            let token = try await authorizedToken()
            var backups: [[String: Any]] = []
            var nextPageToken: String?
            var seenPageTokens = Set<String>()
            var pagesRead = 0

            repeat {
                guard pagesRead < 20 else { throw BackupError.invalidResponse }
                pagesRead += 1
                var url = URLComponents(string: "https://www.googleapis.com/drive/v3/files")!
                url.queryItems = [
                    URLQueryItem(name: "spaces", value: "appDataFolder"),
                    URLQueryItem(name: "q", value: "name contains 'scirun5k-backup-' and mimeType = 'application/json' and trashed = false"),
                    URLQueryItem(name: "fields", value: "nextPageToken,files(id,name,modifiedTime,size)"),
                    URLQueryItem(name: "orderBy", value: "modifiedTime desc"),
                    URLQueryItem(name: "pageSize", value: "1000")
                ]
                if let nextPageToken {
                    url.queryItems?.append(URLQueryItem(name: "pageToken", value: nextPageToken))
                }
                guard let requestUrl = url.url else { throw BackupError.invalidResponse }
                let pageData = try await send(driveRequest(requestUrl, method: "GET", token: token))
                let page = try object(from: pageData)
                guard let files = page["files"] as? [[String: Any]] else { throw BackupError.invalidResponse }
                for file in files {
                    guard let id = file["id"] as? String,
                          let name = file["name"] as? String,
                          let modifiedTime = file["modifiedTime"] as? String else { continue }
                    backups.append([
                        "id": id,
                        "name": name,
                        "modifiedTime": modifiedTime,
                        "size": Int64(file["size"] as? String ?? "") ?? 0
                    ])
                }
                nextPageToken = page["nextPageToken"] as? String
                if let nextPageToken, !seenPageTokens.insert(nextPageToken).inserted {
                    throw BackupError.invalidResponse
                }
            } while nextPageToken != nil

            return ["backups": backups]
        }
    }

    @objc public func uploadBackup(_ call: CAPPluginCall) {
        perform(call) { [self] in
            guard let json = call.getString("json"), let content = json.data(using: .utf8),
                  !content.isEmpty, content.count <= maxBackupBytes else { throw BackupError.invalidBackup }
            let token = try await authorizedToken()
            let stamp = ISO8601DateFormatter().string(from: Date()).replacingOccurrences(of: ":", with: "-")
            let name = "scirun5k-backup-\(stamp)-\(UUID().uuidString).json"
            let metadata = try JSONSerialization.data(withJSONObject: [
                "name": name,
                "mimeType": "application/json",
                "parents": ["appDataFolder"]
            ])
            let boundary = "scirun-\(UUID().uuidString)"
            var body = Data()
            body.append(Data("--\(boundary)\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n".utf8))
            body.append(metadata)
            body.append(Data("\r\n--\(boundary)\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n".utf8))
            body.append(content)
            body.append(Data("\r\n--\(boundary)--\r\n".utf8))

            var url = URLComponents(string: "https://www.googleapis.com/upload/drive/v3/files")!
            url.queryItems = [
                URLQueryItem(name: "uploadType", value: "multipart"),
                URLQueryItem(name: "fields", value: "id,modifiedTime")
            ]
            guard let requestUrl = url.url else { throw BackupError.invalidResponse }
            let savedData = try await send(driveRequest(
                requestUrl, method: "POST", token: token, body: body,
                contentType: "multipart/related; boundary=\(boundary)"
            ))
            let saved = try object(from: savedData)
            guard let id = saved["id"] as? String,
                  let modifiedTime = saved["modifiedTime"] as? String else { throw BackupError.invalidResponse }
            return ["id": id, "modifiedTime": modifiedTime]
        }
    }

    @objc public func downloadBackup(_ call: CAPPluginCall) {
        perform(call) { [self] in
            guard let id = call.getString("id"),
                  id.range(of: "^[A-Za-z0-9_-]{1,256}$", options: .regularExpression) != nil else {
                throw BackupError.invalidFileId
            }
            let token = try await authorizedToken()
            var url = URLComponents(string: "https://www.googleapis.com/drive/v3/files/\(id)")!
            url.queryItems = [URLQueryItem(name: "alt", value: "media")]
            guard let requestUrl = url.url else { throw BackupError.invalidResponse }
            let data = try await send(driveRequest(requestUrl, method: "GET", token: token),
                                      maxBytes: maxBackupBytes)
            guard !data.isEmpty, data.count <= maxBackupBytes,
                  let json = String(data: data, encoding: .utf8) else { throw BackupError.invalidBackup }
            return ["json": json]
        }
    }
}
