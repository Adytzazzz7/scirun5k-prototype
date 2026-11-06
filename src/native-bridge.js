import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Haptics } from '@capacitor/haptics';
import { Share } from '@capacitor/share';

if (Capacitor.isNativePlatform()) {
  window.SciRunNative = {
    isNative: true,
    async vibrate(pattern) {
      const steps = Array.isArray(pattern) ? pattern : [pattern];
      for (let index = 0; index < steps.length; index++) {
        const duration = Number(steps[index]);
        if (!Number.isFinite(duration) || duration <= 0) continue;
        if (index % 2 === 0) await Haptics.vibrate({ duration });
        else await new Promise(resolve => setTimeout(resolve, duration));
      }
    },
    async shareBackup(json) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const { uri } = await Filesystem.writeFile({
        path: `scirun5k-backup-${stamp}.json`,
        data: json,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      await Share.share({
        title: 'SciRun 5K backup',
        url: uri,
        dialogTitle: 'Salvează copia SciRun 5K',
      });
    },
    async clearBackupCache() {
      const { files } = await Filesystem.readdir({ path: '', directory: Directory.Cache });
      for (const file of files) {
        if (file.type !== 'file' || !/^scirun5k-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json$/.test(file.name)) continue;
        await Filesystem.deleteFile({ path: file.name, directory: Directory.Cache });
      }
    },
  };
}
