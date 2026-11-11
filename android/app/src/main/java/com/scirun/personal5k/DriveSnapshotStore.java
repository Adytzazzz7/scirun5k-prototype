package com.scirun.personal5k;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Immutable SciRun JSON snapshots in the signed-in account's hidden Drive appDataFolder. */
final class DriveSnapshotStore {
    static final int MAX_BACKUP_BYTES = 5_000_000;
    private static final String API = "https://www.googleapis.com/drive/v3/files";
    private static final String UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,size";
    private static final String FILE_PREFIX = "scirun5k-backup-";
    private static final String LEGACY_FILE_PREFIX = "scirun5k-snapshot-";
    private static final int MAX_LIST_PAGES = 20;

    private DriveSnapshotStore() {}

    static JSObject listBackups(String accessToken) throws IOException, JSONException {
        List<JSONObject> files = listFiles(accessToken);
        JSArray backups = new JSArray();
        for (JSONObject file : files) backups.put(file);
        JSObject result = new JSObject();
        result.put("backups", backups);
        return result;
    }

    static JSObject uploadBackup(String accessToken, String json) throws IOException, JSONException {
        byte[] content = requireBundle(json);
        String name = newSnapshotName();
        JSONObject metadata = new JSONObject()
            .put("name", name)
            .put("mimeType", "application/json")
            .put("parents", new JSONArray().put("appDataFolder"));
        String boundary = "scirun-" + UUID.randomUUID();
        ByteArrayOutputStream body = new ByteArrayOutputStream(content.length + 600);
        body.write(("--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"
            + metadata + "\r\n--" + boundary + "\r\nContent-Type: application/json\r\n\r\n")
            .getBytes(StandardCharsets.UTF_8));
        body.write(content);
        body.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));

        HttpURLConnection connection = open(UPLOAD_API, "POST", accessToken);
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "multipart/related; boundary=" + boundary);
        byte[] requestBody = body.toByteArray();
        connection.setFixedLengthStreamingMode(requestBody.length);
        try {
            try (OutputStream output = connection.getOutputStream()) {
                output.write(requestBody);
            }
            JSONObject created = readJson(connection, 100_000);
            String id = created.optString("id");
            if (id.isEmpty()) throw new IOException("Google Drive did not return a backup ID");
            JSObject result = new JSObject();
            result.put("id", id);
            result.put("name", created.optString("name", name));
            result.put("modifiedTime", created.optString("modifiedTime"));
            result.put("size", content.length);
            return result;
        } finally {
            connection.disconnect();
        }
    }

    static JSObject downloadBackup(String accessToken, String id) throws IOException, JSONException {
        if (id == null || id.isEmpty() || id.length() > 256) throw new IOException("Invalid backup ID");
        boolean ownedBySciRun = false;
        for (JSONObject file : listFiles(accessToken)) {
            if (id.equals(file.optString("id"))) {
                ownedBySciRun = true;
                break;
            }
        }
        if (!ownedBySciRun) throw new IOException("SciRun backup not found");

        HttpURLConnection connection = open(API + "/" + encode(id) + "?alt=media", "GET", accessToken);
        try {
            byte[] content = readBytes(connection, MAX_BACKUP_BYTES);
            String json = new String(content, StandardCharsets.UTF_8);
            requireBundle(json);
            JSObject result = new JSObject();
            result.put("id", id);
            result.put("json", json);
            return result;
        } finally {
            connection.disconnect();
        }
    }

    private static List<JSONObject> listFiles(String accessToken) throws IOException, JSONException {
        List<JSONObject> backups = new ArrayList<>();
        String pageToken = "";
        for (int page = 0; page < MAX_LIST_PAGES; page++) {
            String url = API + "?spaces=appDataFolder&pageSize=1000&fields="
                + encode("nextPageToken,files(id,name,mimeType,size,modifiedTime)")
                + (pageToken.isEmpty() ? "" : "&pageToken=" + encode(pageToken));
            HttpURLConnection connection = open(url, "GET", accessToken);
            JSONObject response;
            try {
                response = readJson(connection, 2_000_000);
            } finally {
                connection.disconnect();
            }
            JSONArray files = response.optJSONArray("files");
            if (files == null) throw new IOException("Invalid Google Drive listing");
            for (int index = 0; index < files.length(); index++) {
                JSONObject file = files.optJSONObject(index);
                if (file == null) continue;
                String name = file.optString("name");
                if (!(name.startsWith(FILE_PREFIX) || name.startsWith(LEGACY_FILE_PREFIX))
                    || !name.endsWith(".json")
                    || !"application/json".equals(file.optString("mimeType"))) continue;
                long size = file.optLong("size", -1);
                if (size < 1 || size > MAX_BACKUP_BYTES) continue;
                JSONObject summary = new JSONObject()
                    .put("id", file.optString("id"))
                    .put("name", name)
                    .put("modifiedTime", file.optString("modifiedTime"))
                    .put("size", size);
                if (!summary.optString("id").isEmpty()) backups.add(summary);
            }
            pageToken = response.optString("nextPageToken");
            if (pageToken.isEmpty()) {
                Collections.sort(backups, Comparator
                    .comparing((JSONObject file) -> file.optString("modifiedTime")).reversed()
                    .thenComparing(file -> file.optString("id")));
                return backups;
            }
        }
        throw new IOException("Too many Google Drive backups to list safely");
    }

    private static byte[] requireBundle(String json) throws IOException {
        if (json == null) throw new IOException("Missing SciRun backup");
        byte[] content = json.getBytes(StandardCharsets.UTF_8);
        if (content.length < 2 || content.length > MAX_BACKUP_BYTES) {
            throw new IOException("SciRun backup exceeds the 5 MB limit");
        }
        try {
            JSONObject bundle = new JSONObject(json);
            if (!"scirun5k".equals(bundle.optString("app")) || bundle.optInt("version") != 2
                || bundle.optJSONObject("state") == null || bundle.optJSONObject("preferences") == null
                || !bundle.has("activeTimer") || !bundle.has("pendingSession")) {
                throw new IOException("Invalid SciRun backup");
            }
        } catch (JSONException exception) {
            throw new IOException("Invalid SciRun backup", exception);
        }
        return content;
    }

    private static String newSnapshotName() {
        SimpleDateFormat format = new SimpleDateFormat("yyyyMMdd'T'HHmmss'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return FILE_PREFIX + format.format(new Date()) + "-" + UUID.randomUUID() + ".json";
    }

    private static HttpURLConnection open(String url, String method, String accessToken) throws IOException {
        if (accessToken == null || accessToken.isEmpty()) throw new IOException("Google authorization expired");
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setRequestMethod(method);
        connection.setRequestProperty("Authorization", "Bearer " + accessToken);
        connection.setRequestProperty("Accept", "application/json");
        connection.setConnectTimeout(15_000);
        connection.setReadTimeout(30_000);
        return connection;
    }

    private static JSONObject readJson(HttpURLConnection connection, int limit) throws IOException, JSONException {
        return new JSONObject(new String(readBytes(connection, limit), StandardCharsets.UTF_8));
    }

    private static byte[] readBytes(HttpURLConnection connection, int limit) throws IOException {
        int status = connection.getResponseCode();
        if (status < 200 || status >= 300) throw new IOException("Google Drive returned HTTP " + status);
        try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] chunk = new byte[8192];
            int read;
            while ((read = input.read(chunk)) != -1) {
                if (output.size() + read > limit) throw new IOException("Google Drive response exceeds the size limit");
                output.write(chunk, 0, read);
            }
            return output.toByteArray();
        }
    }

    private static String encode(String value) throws IOException {
        return URLEncoder.encode(value, "UTF-8");
    }
}
