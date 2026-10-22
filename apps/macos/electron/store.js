import fs from 'node:fs';
import path from 'node:path';
export class LocalStore {
  constructor(directory) {
    fs.mkdirSync(directory, { recursive: true });
    this.file = path.join(directory, 'fitgate.json');
    this.warning = '';
  }
  read() {
    try {
      const value = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid data');
      return value;
    }
    catch (error) {
      if (error.code !== 'ENOENT') {
        this.warning = '上次记录无法读取，已保留原文件并使用默认配置。';
        fs.copyFileSync(this.file, `${this.file}.recovered-${Date.now()}`);
      }
      return {};
    }
  }
  write(value) {
    const temporary = `${this.file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
    fs.renameSync(temporary, this.file);
  }
}
