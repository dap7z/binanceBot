const {app, BrowserWindow, ipcMain} = require('electron')
const path = require('path')
const url = require('url')


//== CUSTOM CODE ==
// Right click, inspect element
require('electron-context-menu')({
    prepend: (params, browserWindow) => [{
    label: 'Rainbow',
    // Only show it when right-clicking images
    visible: params.mediaType === 'image'
}]
});
//TODO: Fix (no more working in tab webview...)
//==================

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win

function createWindow () {
  // Create the browser window.
  // == CUSTOM CODE ==
  win = new BrowserWindow({width: 1600, height: 800})
  //==================

  // and load the index.html of the app.
  win.loadURL(url.format({
    pathname: path.join(__dirname, 'container.html'),
    protocol: 'file:',
    slashes: true
  }))

    //== CUSTOM CODE ==
    // Hide menubar :
    win.setMenu(null)
    // Open the DevTools :
    win.webContents.openDevTools() //container.html => OSEF
    // Increase setTimeout reliability :
    var powerSaveBlocker = require('electron').powerSaveBlocker;
    powerSaveBlocker.start('prevent-app-suspension')
    //==================

  // Emitted when the window is closed.
  win.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    win = null
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
//   if (process.platform !== 'darwin') {
    app.quit()
//   }
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    createWindow()
  }
})


//each event has to be redirected here :
ipcMain.on('show-message', (event, params) => {
    if (win) {
        win.webContents.send('show-message', params);
    }

})
ipcMain.on('change-url', (event, params) => {
    if (win) {
        win.webContents.send('change-url', params);
    }

})
ipcMain.on('change-title', (event, params) => {
    if (win) {
        win.webContents.send('change-title', params);
    }

})
ipcMain.on('console-log', (event, params) => {
    if (win) {
        win.webContents.send('console-log', params);
    }

})
ipcMain.on('console-error', (event, params) => {
    if (win) {
        win.webContents.send('console-error', params);
    }

})

ipcMain.on('send-input-event', (event, params) => {
    if (win && (params.type=='mouseDown' || params.type=='mouseUp'))
    {
        //fix decalage y (tabs bar)
        let decalageY = 50; //32;
        params.y += decalageY;

        //fix decalage y (webview)
        //win.getHeight()

        win.webContents.sendInputEvent(params);
        //view purpose only:
        win.webContents.send('show-fake-cursor', params);
    }
    else
    {
        //mouseMove
        win.webContents.send('send-input-event', params);
    }
    // mouseDown/mouseUp seems not working when redirected to container.js as mouseMove
})


ipcMain.on('graph-new-values', (event, params) => {
    if (win) {
        win.webContents.send('graph-new-values', params);
    }
})