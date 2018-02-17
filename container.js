const useragent = "Mozilla/5.0 (Windows NT 6.1; WOW64; Trident/7.0; AS; rv:11.0) like Gecko";
const TabGroup = require('electron-tabs');
const dragula = require('dragula');


let tabGroup = new TabGroup({
    newTab: {
        title: 'Search',
        icon: 'fa fa-search'
    },
    closeButtonText: '&#x2715;',
    ready: tabGroup => {
        dragula([tabGroup.tabContainer], {
            direction: 'horizontal'
        });
    }
});

function openTabDevTools(tab){
    //return false; //DISABLED
    //Open dev tools for webview
    let webview = tab.webview
    if (!!webview) {
        webview.addEventListener('dom-ready', () => {
            webview.openDevTools();
        })
    }
}


//(first tab: less complex to send fake input events)
let tabTradingView = tabGroup.addTab({
    title: 'TradingViewHooks',
    src: 'https://www.tradingview.com',
    //to connect user or verify user connected
    webviewAttributes: {
        'nodeintegration': true,
        'useragent':useragent,
        'preload': './injector.js',
    },
    icon: 'fa fa-home',
    visible: true,
    closable: false,
    active: true,
    //ready: function(tab){openTabDevTools(tab)}
});


let tabBot = tabGroup.addTab({
    title: 'BinanceBot',
    src: './bot.html',
    webviewAttributes: {
        'nodeintegration': true,
		'useragent':useragent
    },
    icon: 'fa fa-home',
    visible: true,
    closable: false,
    active: false
});


let tabTestUserAgent = tabGroup.addTab({
    title: 'TestUserAgent',
    src: 'https://www.whoishostingthis.com/tools/user-agent',
	webviewAttributes: {
        'nodeintegration': true,
		'useragent':useragent
    },
    visible: true,
    closable: true,
    active: false
});



const { ipcRenderer } = require('electron');

ipcRenderer.on('show-message', (event, params) => {
    toastr.info(params, '', {positionClass: "toast-bottom-full-width"});
})


ipcRenderer.on('console-log', (event, params) => {
    console.log(params);
})


ipcRenderer.on('console-error', (event, params) => {
    console.error(params);
})


ipcRenderer.on('change-url', (event, params) => {
    tabTradingView.webview.loadURL(params);
})


ipcRenderer.on('change-title', (event, params) => {
    tabTradingView.setTitle(params);
})


let hideTimeoutIdentifier = null;
function showFakeCursor(params){
    if(hideTimeoutIdentifier!=null){
        window.clearTimeout(hideTimeoutIdentifier);
    }
    let $cursor = $('#fake-cursor');
    let leftPos = params.x - 3;
    let topPos = params.y - 3;
    $cursor.attr('style', 'left:'+ leftPos +'px; top:'+ topPos +'px;')
    $cursor.show();
    hideTimeoutIdentifier = setTimeout(function(){
        $cursor.hide();
    }, 1000);
}

ipcRenderer.on('send-input-event', (event, params) => {
    //exemple: params = {type: 'mouseMove', x: 10, y: 10}

    //send event directly to webview (y start at 0)
    tabTradingView.webview.sendInputEvent(params);

    if(tabGroup.getActiveTab() === tabTradingView){
        //view purpose only :
        params.y += 50; //fix decalage y (tabs bar)
        showFakeCursor(params);
    }
})


ipcRenderer.on('show-fake-cursor', (event, params) => {
    showFakeCursor(params);
})

let graphNewValuesFirstTime = true;
ipcRenderer.on('graph-new-values', (event, params) => {
    tabBot.webview.send('graph-new-values', params);
    if(graphNewValuesFirstTime){
        graphNewValuesFirstTime = false;
        //graph is ready, we can now pass to bot tab :
        tabBot.activate();
    }
})


