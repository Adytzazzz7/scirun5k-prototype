package com.scirun.personal5k;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GoogleBackupPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
