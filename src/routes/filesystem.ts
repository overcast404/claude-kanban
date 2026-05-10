import { Router, Request, Response } from 'express';
import { execFile } from 'child_process';

export const filesystemRouter = Router();

filesystemRouter.post('/pick-directory', (_req: Request, res: Response) => {
  const platform = process.platform;

  let cmd: string;
  let args: string[];

  if (platform === 'darwin') {
    cmd = 'osascript';
    args = ['-e', 'POSIX path of (choose folder with prompt "选择工作目录")'];
  } else if (platform === 'win32') {
    cmd = 'powershell';
    args = [
      '-NoProfile',
      '-STA',
      '-Command',
      "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = '选择工作目录'; if ($f.ShowDialog() -eq 'OK') { $f.SelectedPath }",
    ];
  } else {
    cmd = 'zenity';
    args = ['--file-selection', '--directory', '--title=选择工作目录'];
  }

  execFile(cmd, args, { timeout: 60000 }, (err, stdout, stderr) => {
    if (err) {
      const code = (err as any).code;
      if (code === 1 || code === 'ENOENT') {
        return res.json({ cancelled: true });
      }
      console.error(`[filesystem] pick-directory failed: cmd=${cmd} code=${code} err="${err.message}" stderr="${stderr || ''}"`);
      return res.json({ error: `无法打开文件选择器: ${err.message}` });
    }

    const selectedPath = (stdout || '').trim();
    if (!selectedPath) {
      return res.json({ cancelled: true });
    }

    res.json({ path: selectedPath });
  });
});
