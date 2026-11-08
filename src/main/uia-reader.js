'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { app } = require('electron');

/**
 * UIA 取词：用系统自带的 csc.exe 编译 resources/uia-reader.cs（一次性），
 * 每次取词时调用它读取前台窗口的选中文本。编译失败或读不到时返回空串，
 * 由调用方回退到 OCR。
 */

let compilePromise = null;
let exePath = null;

function findCsc() {
  const winDir = process.env.WINDIR || 'C:\\Windows';
  const candidates = [
    path.join(winDir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    path.join(winDir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function ensureCompiled() {
  if (!compilePromise) {
    compilePromise = new Promise((resolve) => {
      const src = path.join(app.getAppPath(), 'resources', 'uia-reader.cs');
      const dir = path.join(app.getPath('userData'), 'uia-helper');
      const exe = path.join(dir, 'uia-reader.exe');

      // 已编译且源码没更新过，直接复用
      if (fs.existsSync(exe) && fs.existsSync(src) &&
          fs.statSync(exe).mtimeMs >= fs.statSync(src).mtimeMs) {
        exePath = exe;
        resolve(exe);
        return;
      }

      const csc = findCsc();
      if (!csc || !fs.existsSync(src)) {
        console.error('UIA 取词不可用：找不到 csc.exe 或 uia-reader.cs，回退纯 OCR');
        resolve(null);
        return;
      }

      try {
        fs.mkdirSync(dir, { recursive: true });
        // 纯 DllImport + ComImport 实现，无需额外程序集引用
        const args = ['/nologo', '/target:exe', `/out:${exe}`, src];
        execFile(csc, args, { timeout: 60000, windowsHide: true }, (err) => {
          if (err || !fs.existsSync(exe)) {
            console.error('UIA 助手编译失败，回退纯 OCR:', err ? err.message : '');
            resolve(null);
            return;
          }
          exePath = exe;
          resolve(exe);
        });
      } catch (err) {
        console.error('UIA 助手编译失败，回退纯 OCR:', err.message);
        resolve(null);
      }
    });
  }
  return compilePromise;
}

/** 读取前台窗口选中文本；失败/读不到返回空串 */
function readSelectedText() {
  return ensureCompiled().then((exe) => {
    if (!exe) return '';
    return new Promise((resolve) => {
      execFile(exe, [], { timeout: 4000, encoding: 'utf8', windowsHide: true }, (err, stdout) => {
        // 退出码 1 = 无选中文本（正常，交给 OCR）；2 = 异常；err 也可能只是退出码非 0
        resolve((stdout || '').trim());
      });
    });
  });
}

/** 应用启动时预热编译（后台，不阻塞） */
function init() {
  ensureCompiled();
}

module.exports = { init, readSelectedText };
