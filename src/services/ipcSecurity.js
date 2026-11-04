'use strict';

// Only the app's top-level, expected local document may invoke privileged APIs.
// Checking senderFrame (not just sender) avoids trusting child/embedded frames.
function assertTrustedIpcSender(event, mainWindow, expectedUrl) {
  const contents = mainWindow && mainWindow.webContents;
  if (!contents ||
      (typeof mainWindow.isDestroyed === 'function' && mainWindow.isDestroyed()) ||
      !event ||
      event.sender !== contents ||
      !event.senderFrame ||
      event.senderFrame !== contents.mainFrame ||
      event.senderFrame.url !== expectedUrl) {
    throw new Error('Unauthorized IPC sender');
  }
}

module.exports = { assertTrustedIpcSender };
