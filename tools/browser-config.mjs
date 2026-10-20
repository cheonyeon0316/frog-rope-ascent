import { existsSync } from 'node:fs';
import path from 'node:path';
export const gameURL = process.env.GAME_URL ?? 'http://127.0.0.1:5173/';
const paths = [process.env.CHROME_PATH,
  path.join(process.env.ProgramFiles ?? 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env['ProgramFiles(x86)'] ?? 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe')];
export const launchOptions = { headless: true, executablePath: paths.find(p => p && existsSync(p)) };
