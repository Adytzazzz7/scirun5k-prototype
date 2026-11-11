import Capacitor

// Use this as the root controller in Capacitor 8.6's SceneDelegate.
public class SciRunBridgeViewController: CAPBridgeViewController {
    public override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(GoogleBackupPlugin())
    }
}
