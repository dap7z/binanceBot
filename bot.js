const { ipcRenderer } = require('electron');
ipcRenderer.send('show-message', 'hello from bot.js');


//==== redirect console.log to display in main devtools ====
ORIGIN = {
    console: {
        log: console.log,
        error: console.error
    }
};
console.log = function(obj){
    ipcRenderer.send('console-log', obj);
    ORIGIN.console.log(obj);
}
console.error = function(obj){
    ipcRenderer.send('console-error', obj);
    ORIGIN.console.error(obj);
}
//console.log('console.log from bot.js');
//=========================================================


ipcRenderer.on('graph-new-values', (event, params) => {
    //to pass here, graph-new-values message had to be redirected from :
    //injector.js -> main.js -> container.js -> bot.js
    console.log('bot.js on graph-new-values     SMA:'+ params.SMA +" DP0:"+ params.DP0 +" ["+ params.timestamp +"]");

    //TODO
    //Si sma < 0 et les deux derniers dpo (2 dernieres séances) sont > 0 (petites barres verte) LONG
    //Si sma > 0 et le dernier dpo < 0 (petites barres rouge) SELL LE LONG

    //TMP TO TEST: INSTANTS VALUES
    //Si sma < 0 et dp0 > 0  =>  BUY
    //Si sma > 0 et dp0 < 0  =>  SELL
    if(params.SMA<0 && params.DP0>0 && !bot.inPosition){
        bot.position.enter('ETHUSDT', 'BUYSIGNAL_GRAPH');
        $("#positionCurrency").html("ETH");
        ipcRenderer.send('show-message', '-- BUY --');
    }
    if(params.SMA>0 && params.DP0<0 && bot.inPosition){
        bot.position.leave('ETHUSDT', 'SELLSIGNAL_GRAPH');
        $("#positionCurrency").html("USDT");
        ipcRenderer.send('show-message', '-- SELL --');
    }

});



//================== BINANCEBOT RENDERED.JS =========================

// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.

/*
//STATS WEBSITES:
https://coinzaa.com/tools/binex
https://cointracking.info
https://www.tradingview.com/cryptocurrency-signals/


//BINANCE API:
- GET /api/v1/ticker/allPrices
Latest price for all symbols.


NEXT VERSIONS:
- control profit loss
- control BTC dump
- real trading mode
- indicateurs gange/btc run :
    % alt coins en chute,
    temps pump moyen tres faible,
    cours BTC/USDT,
    heure du jour,
    jour de la semaine
    https://coinzaa.com/tools/binex
        => Market Cap
        => [binanceAPI] Percent price movement
        => [binanceAPI?] Percent change in number of open buy orders
        => P/V: Price / volume correlation for the past 20 days. Measures how much the price moves up when volume increases.
        => [binanceAPI] 24h % change
        => [binanceAPI] 24h Volume BTC
        => [binanceAPI?] 5mins Volume BTC


//NEW RULE FOR ENTER POSITION:
//wait for a new "Buy Strong" signal.
//only enter if if total price variation is positive
//only enter if liquidity is correct (volume >= 1000 btc/day)

*/


//== libraries ==
const got = require('got');
const dateFormat = require('dateformat');
const cheerio = require('cheerio');
const binance = require('node-binance-api');
binance.options({
    //TODO fichier conf.js git.ignore
    'APIKEY':'',
    'APISECRET':'',
});
// // 24h price for all symbols:
// binance.websockets.prevDay(false, function(response) {
//     log.diag(response);
// });
//
//const sequelize = require('sequelize');
//let TYPE_DATE_TIME = sequelize.DATE;
//let TYPE_DATE_TIME = sequelize.BIGINT;
//================



//== parameters ==
//let NB_SECONDS_BETWEEN_API_CALL = 20;
//let NB_SECONDS_BETWEEN_API_CALL = 1;
let NB_SECONDS_BETWEEN_API_CALL = 10;
let URL_STATS = 'https://coinzaa.com/tools/binex';
let URL_ACTUALS_PRICES = 'https://www.binance.com/api/v1/ticker/allPrices';
let URL_SYMBOL_PRICE = 'https://api.binance.com/api/v1/ticker/price?symbol=';
let NB_SECONDS_BEFORE_START_TRADING = 60*5 + 3;
NB_SECONDS_BEFORE_START_TRADING = 1;  //DEV & DEBUG ONLY /!\
let CURRENCY_REFERENCE = 'USDT'; //BTC or ETH or USDT

let USE_DATABASE = false;
let READY_DATABASE = false;
let READY_TRADING = false;
//================





//== initialisation ==
const { Client } = require('pg');
const database = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'bigpassword',
    database: 'bigdata',
});

let log = {
    currentLvlTxt: 'diag',  //put your setting here
    dispatch: function(lvlTxt, log, logObj){
        let forceConsole = false;
        if(lvlTxt === 'info'){
            let d = new Date(); //d.toUTCString()
            let dTxt = dateFormat(d, 'yyyy-mm-dd HH:MM:ss');
            $("#table-logs").tabulator("addRow", {date: dTxt, detail: log});
            //TODO: + write in file or better: bdd
            forceConsole = true;
        }
        if( forceConsole || (this.getLvl(lvlTxt) >= this.getLvl(this.currentLvlTxt)) )
        {
            let logString = '#' + lvlTxt + '# ';
            if(typeof log === 'object'){
                console.log(logString);
                console.log(log);
            }else{
                console.log(logString + log);
            }

            if(logObj){
                console.log(logObj);
            }
        }
        //else logs are just ignored (if currentLvlTxt > lvlTxt)
    },
    getLvl: function(lvlTxt){
        switch(lvlTxt){
            case 'trace': return 1;
            case 'info': return 2;
            case 'warning': return 3;
            case 'error': return 4;
            case 'diag': return 5;
            default: return 0;
        }
    },
    trace: function(text, o){ if(typeof o==='undefined') o=null; this.dispatch('trace', text, o) },  //verbose
    info: function(text, o){ if(typeof o==='undefined') o=null; this.dispatch('info', text, o) },
    warning: function(text, o){ if(typeof o==='undefined') o=null; this.dispatch('warning', text, o) },
    error: function(text, o){ if(typeof o==='undefined') o=null; this.dispatch('error', text, o) },
    diag: function(text, o){ if(typeof o==='undefined') o=null; this.dispatch('diag', text, o) },
};

function precisionRound(number, precision) {
    //to round with precision
    let factor = Math.pow(10, precision);
    return Math.round(number * factor) / factor;
}
function has(object, key) {
    //to check if an object have one property
    return object ? Object.prototype.hasOwnProperty.call(object, key) : false;
}
function diffDateSeconds(dt2, dt1, precision){
    let diff =(dt2.getTime() - dt1.getTime()) / 1000;
    if(typeof precision !== 'undefined'){
        diff = precisionRound(diff, precision);
    }
    return Math.abs(diff);
}
function diffDateMinutes(dt2, dt1, precision)
{
    let diff = diffDateSeconds(dt2, dt1);
    diff /= 60;
    if(typeof precision !== 'undefined'){
        diff = precisionRound(diff, precision);
    }
    return Math.abs(diff);
}
function readPair(pair, calltrace){
    let symbol = '';
    if(pair.endsWith(CURRENCY_REFERENCE)){
        //slice remove last chars: (BTC/ETH/USDT)
        let nbLastChar = CURRENCY_REFERENCE.length;
        symbol = pair.slice(0, -nbLastChar);
    }else{
        console.error("readPair('"+ pair +"') called from: "+ calltrace);
    }
    return symbol;
}
function EXCEPTION(code, detail){
    let omg = 'SELL FOR '+ CURRENCY_REFERENCE +' AND STOP THE BOT';
    log.error('EXCEPTION['+ code +'] '+ omg + ', reason: '+ detail);
    //1) SELL FOR CURRENCY_REFERENCE
    bot.position.leave(bot.position.currentShitCoin, 'EXCEPTION '+code);
    //2) SWITCH TO PAPER TRADING
    //TODO
}
let bestCurrency = '';
let bestCurrencyNew = '';
let moneyStart = 1;
if(CURRENCY_REFERENCE === 'USDT'){
    moneyStart = 2000;
}
let moneyLastSell = moneyStart;
let lastPrices = null;



/******************************** DEBUT TEST IMAP GMAIL ***********************************
//https://www.npmjs.com/package/mail-listener-next
let MailListener = require("mail-listener-next");
//and require: https://myaccount.google.com/lesssecureapps

let mailListener = new MailListener({
    username: "jean.trader.4.life@gmail.com",
    password: "123trader",
    host: "imap.gmail.com",
    port: 993, // imap port
    tls: true,
    connTimeout: 10000, // Default by node-imap
    authTimeout: 5000, // Default by node-imap,
    //debug: console.log, // Or your custom function with only one incoming argument. Default: null
    tlsOptions: { rejectUnauthorized: false },
    mailbox: "INBOX", // mailbox to monitor
    //searchFilter: ["UNSEEN", "FLAGGED"], // the search filter being used after an IDLE notification has been retrieved
    fetchUnreadOnStart: true, // use it only if you want to get all unread email on lib start. Default is `false`,
    mailParserOptions: {streamAttachments: true}, // options to be passed to mailParser lib.
    attachments: true, // download attachments as they are encountered to the project directory
    attachmentOptions: { directory: "attachments/" }, // specify a download directory for attachments
    // to make server respond to other requests you may want
    // to pause for 'fetchingPauseTime' fetching of the email, because it 'hangs' your app
    fetchingPauseThreshold: null, // amount bytes
    fetchingPauseTime: 5000 // ms to pause fetching and process other requests
});


mailListener.start(); // start listening
// stop listening
//mailListener.stop();


mailListener.on("server:connected", function(){
    log.diag("imapConnected");
});

mailListener.on("server:disconnected", function(){
    log.diag("imapDisconnected");
});

mailListener.on("error", function(err){
    log.diag(err);
});

dateStartReadMail = new Date();
mailListener.on("mail", function(mail, seqno, attributes){
    //Process new received mails from noreply@tradingview.com
    if(mail.date>dateStartReadMail && mail.from[0].address === 'noreply@tradingview.com')
    {
        if(mail.subject === 'TradingView Alert: BUYSIGNAL_ETHUSDT'){
            log.diag('[mail received] '+ mail.subject);
            if(bot.inPosition === false){
                bot.position.enter('ETHUSDT', 'BUYSIGNAL_ETHUSDT');
                //bot.refreshAfterPositionEnter();  //NOK HERE?
                $("#positionCurrency").html("ETH");
            }
        }
        else if(mail.subject === 'TradingView Alert: SELLSIGNAL_ETHUSDT'){
            log.diag('[mail received] '+ mail.subject);
            if(bot.inPosition === true){
                bot.position.leave('ETHUSDT', 'SELLSIGNAL_ETHUSDT');
                $("#positionCurrency").html("USDT");
            }
        }
    }
});
******************************** FIN TEST IMAP GMAIL ***********************************/



//== START BOT OBJECT ==
let bot = {
    dateInit: null,
    inPosition: false
};

bot.position = {
    previousAmountInBTC: 0,
    previousShitCoin: '',
    amountInBTC: 0,
    amountInShitCoin: 0,
    currentShitCoin: '',
    dateEnter: null,
    dateLeave: null,
    priceEnter: 0,
    priceLeave: 0,
    priceCurrent: 0,
    enter: async function(symbol, reason){
        //=> BUY
        if(typeof reason === 'undefined'){
            reason = '';
        }else{
            reason = ' (reason: '+ reason +')';
        }
        this.dateEnter = new Date();
        this.priceEnter = await getPrice(symbol);
        this.priceCurrent = this.priceEnter;
        this.currentShitCoin = symbol;
        this.previousAmountInBTC = this.amountInBTC;
        this.amountInShitCoin = this.amountInBTC/(feesAdd(this.priceEnter));
        log.trace('bot.position.enter(symbol:'+ symbol +') => return amountInShitCoin: '+ this.amountInShitCoin);
        //-- LOG BUY --
        let roundNbShitcoin = precisionRound(this.amountInShitCoin,2);
        log.info('Buy '+ roundNbShitcoin +' '+ symbol +' (with '+ this.previousAmountInBTC +' '+ CURRENCY_REFERENCE +') at '+ this.priceEnter + reason);
        //-------------
        if(this.previousShitCoin == null){
            this.previousShitCoin = this.currentShitCoin;
        }
        this.amountInBTC = 0;
        bot.inPosition = true;
        log.diag('position after buy:', this);

        //TEST HERE
        bot.refreshAfterPositionEnter();

        return this.amountInShitCoin;
    },
    leave: async function(symbol, reason){
        //=> SELL
        this.dateLeave = new Date();
        if(typeof symbol === 'undefined'){
            //symbol parameter not required for leave position
            symbol = this.currentShitCoin;
        }
        if(typeof reason === 'undefined'){
            reason = '';
        }else{
            reason = ' (reason: '+ reason +')';
        }
        this.priceLeave = await getPrice(symbol);
        this.amountInBTC = this.amountInShitCoin*feesSubstract(this.priceLeave);
        moneyLastSell = this.amountInBTC; //permet calcul bot.total.profit(); + maj html this.amountInBTC
        log.trace('bot.position.leave(symbol:'+ symbol +') => return amountInBTC: '+ this.amountInBTC);
        //-- LOG SELL --
        let profitPosition = this.profit();
        let timePosition = this.time();
        log.info('Sell '+ symbol +' at '+ this.priceLeave +' for '+ profitPosition +' profit in '+ timePosition + reason);
        //--------------
        this.amountInShitCoin = 0;
        this.currentShitCoin = '';
        this.previousShitCoin = symbol;
        bot.inPosition = false;
        log.diag('position after sell:', this);
        return this.amountInBTC;
    },
    time: function(){
        let now = new Date();
        if(this.dateEnter){
            return diffDateSeconds(now, this.dateEnter, 2) + ' secondes';
        }
        return 0;
    },
    estimateMoney: function(){
        let result = this.amountInBTC;  //out of position
        if(bot.inPosition){
            result = this.amountInShitCoin*feesSubstract(this.priceCurrent);
        }
        if(result > 100){
            result = precisionRound(result, 4);
        }
        return result;
    },
    profit: function(){
        return precisionRound(100*( (this.estimateMoney() - this.previousAmountInBTC) / this.previousAmountInBTC ), 2) +' %';
    }
};

bot.total = {
    time: function(){
        let now = new Date();
        if(bot.dateInit){
            return diffDateMinutes(now, bot.dateInit, 0) +' minutes'
        }
        return 0;
    },
    profit: function(){
        return precisionRound(100*( (moneyLastSell-moneyStart) / moneyStart ), 2) +' %';
    }

};

bot.refreshStats = function(){
    //update global stats:
    let $blocResults = $('#bloc-results').first();
    $blocResults.find('#totalTime').html( bot.total.time() );
    $blocResults.find('#totalProfit').html( bot.total.profit() );
    $blocResults.find('#moneyStart').html(moneyStart);
    $blocResults.find('#moneyLastSell').html(moneyLastSell);
    $blocResults.find('#moneyEstimated').html(bot.position.estimateMoney());

    //update positions stats:
    $("#positionProfit").html( bot.position.profit() );
    $("#positionTime").html( bot.position.time() );
};
bot.refreshAfterPositionEnter = function(){
    let symbol = this.position.currentShitCoin;
    //1) update currency name:
    $("#positionCurrency").html(symbol);  //eventualy truncate REFERENCE_CURRENCY => make a function
    //2) switch trading view widget graph:
    let srcHash = '#'+ symbol +'|'+ bot.position.priceCurrent;
    let htmlIframe = `
        <iframe
            width="440"
            height="275"
            frameborder="0"
            scrolling="no"
            marginheight="0"
            marginwidth="0"
            src="widget-graph.html`+ srcHash +`">
        </iframe>`;
    $("#widget-graph").html(htmlIframe);
};

bot.init = function (amountInBTC) {
    this.dateInit = new Date();
    this.inPosition = false;
    this.position.amountInBTC = amountInBTC;
    this.position.previousAmountInBTC = amountInBTC;
};
bot.init(moneyStart);
//== END BOT OBJECT ==




async function thread(cptThread) {
    try {

        if(USE_DATABASE && READY_DATABASE===false){
            await initializeDatabase(database);
            READY_DATABASE = true;
        }

        await updatePrices(cptThread);
        //(and refresh screen just after http response before insert results into database)

        if(!READY_TRADING)
        {
            let nbSecondsFromAppStart = diffDateSeconds(new Date(), bot.dateInit);
            if(nbSecondsFromAppStart > NB_SECONDS_BEFORE_START_TRADING){
                READY_TRADING = true;
                log.info('APP START '+ NB_SECONDS_BEFORE_START_TRADING +' SECONDS AGO, PRICES DATA OK FOR TRADING');

                //== INSTANT ENTER POSITION AFTER STARTUP (DIAG ONLY) ==
                if(NB_SECONDS_BEFORE_START_TRADING==0 || NB_SECONDS_BEFORE_START_TRADING==1)
                {
                    if(!bot.inPosition){
                        bot.position.enter('ETHUSDT', 'BUYAFTERSTARTUP_DIAGONLY');
                        $("#positionCurrency").html("ETH");
                        //ipcRenderer.send('show-message', '-- INITIAL BUY (DIAG ONLY) --'); //toast notif catch fake cursor clicks...
                    }
                }
                //=======================================================
            }
        }
        else
        {

            let now = new Date();
            let paramsInit = {};
            paramsInit.p1_Start = now.getTime() - 60000; //60000 ms per minute
            paramsInit.p1To5_Start = paramsInit.p1_Start - 6000*4;
            paramsInit.p5To10_Start = paramsInit.p1To5_Start - 6000*5;
            paramsInit.p10To15_Start = paramsInit.p5To10_Start - 6000*5;
            //adjust timestamp with saved prices data :
            let paramsReal = {
                p10To15_Start: await getCloserTick(paramsInit.p10To15_Start),
                p5To10_Start: await getCloserTick(paramsInit.p5To10_Start),
                p1To5_Start: await getCloserTick(paramsInit.p1To5_Start),
                p1_Start: await getCloserTick(paramsInit.p1_Start),
                p0_Start: await getBeforeLastTick(),
            };

            // //verif (should be 1/5/10/15 mins) :
            // for (let key in paramsReal){
            //     if(typeof paramsInit[key] !== 'undefined'){
            //         log.trace(key+': init('+ paramsInit[key] +') => real('+ paramsReal[key] +') ... diff('+ (paramsReal[key]-paramsInit[key])/1000 +'secs)');
            //         //let verifDate = new Date().setTime(parseInt(paramsReal[key]));
            //         //log.trace(verifDate.toString());  //... show timestamp ... even if console.log(new Date(1515635441196)); works
            //     }
            // }

            if(USE_DATABASE)
            {
                //=========== prices variations from binance
                let sql = sqlPricesVariations(paramsReal);
                database.query(sql, function(err, res){
                    if (err) throw err;
                    if(res.rows.length === 0)
                    {
                        log.error("La requête n'a renvoyée aucun résultat");
                        log.error(sql);
                        log.error(res);
                    }
                    else
                    {
                        let currency = '';
                        for(let i=0 ; i<res.rows.length ; i++)
                        {
                            currency = readPair(res.rows[i].symbol, "database query");
//DISABLED
//
//                          if(i==0){
//                              bestCurrencyNew = currency;
//                          }
                            res.rows[i].symbol = currency;

                            //log.trace(res.rows[i]);
                        }
                        $("#table-stats").tabulator("setData", res.rows)
                    }
                });
                //==================================
            }



            if(bestCurrencyNew === '')
            {
                //TROW EXCEPTION IF STATSWEBSITE DOWN
                EXCEPTION('CANT_GET_STATS', 'STATS WEBSITE DOESNT RESPOND OR PARSER FAIL');
                //IF BTC IS IN HIGHT UP/DOWN TREND
                //TODO: PAUSE THE BOT & LOG PAPER TRADING TO CONFIRM ITS NECESSARY
            }
            else if(bestCurrency !== bestCurrencyNew)
            {
                log.trace('bestCurrencyNew: "'+ bestCurrencyNew +'"');

                if(bot.inPosition){
                    await bot.position.leave(bestCurrency, "BEST CURRENCY CHANGE '"+ bestCurrency +"' TO '"+ bestCurrencyNew +"'");
                }

                await bot.position.enter(bestCurrencyNew);
                bot.refreshAfterPositionEnter();

                //update variables :
                bestCurrency = bestCurrencyNew;
            }


        }

    } catch (error) {
        log.error("=> CATCHED ERROR <=");
        log.error(error);
        //=> 'Internal server error ...'
    }

}


function getCloserTick(timestamp){
    let sql = 'SELECT * FROM ticks ORDER BY ABS(datetime - '+ timestamp +') LIMIT 1';
    return new Promise(resolve => {
        database.query(sql).then(res => {
        resolve(parseInt(res.rows[0].datetime));    //first result
});
});
}

function getBeforeLastTick(){
    let sql = 'SELECT * FROM ticks ORDER BY datetime DESC LIMIT 2';
    return new Promise(resolve => {
        database.query(sql).then(res => {
        resolve(parseInt(res.rows[1].datetime));    //second result
});
});
}



//== Start get price function ==
let getPrice = function(symbol){};
if(USE_DATABASE)
{
    //SQL Request
    getPrice = function(symbol){
        //let symbol = coin+CURRENCY_REFERENCE;
        let obj = {};
        if(lastPrices !== null){
            obj = lastPrices.find(function(o){ return o.symbol===symbol})
        }
        if(has(obj,'price') === false){
            EXCEPTION('CANT_GET_PRICE', 'LAST PRICES OBJECT DOESNT CONTAINS "'+ symbol +'"');
            return -999;
        }
        return obj.price;
    };
}
else
{
    //HTTP Request
    getPrice = async function(symbol) {
    if(symbol===''){
        EXCEPTION('CANT_GET_PRICE', 'NO SYMBOL "'+ symbol +'"');
        return -999;
    }
    let price = 0;
    const response = await got(URL_SYMBOL_PRICE + symbol);
    let parsedResponse = JSON.parse(response.body);
    price = parsedResponse.price;
    log.trace("[HTTP Request] getPrice("+symbol+"): "+price);
    if(parsedResponse.symbol === bot.position.currentShitCoin){
        this.priceCurrent = price;
        bot.refreshStats(); //test 20180129
    }
    return price;
};
}
//== End get price function ==






async function initializeDatabase(database){
    log.trace('console.log [OK]');
    //throw Promise.reject("FAKE FATAL ERROR") //testOK
    database.connect();
    database.query('SELECT NOW() AS test', function(err, res){
        if (err) throw err;
        log.trace('test database.query 1 => '+ res.rows[0].test);
        //database.end() //commente sinon ferme la connection et empeche creation des tables
    });
    database.query('SELECT NOW() AS test', function(err, res){
        if (err) throw err;
        log.trace('test database.query 2 => '+ res.rows[0].test);
    });
    let sql = sqlCreateTables();
    database.query(sql, function(err, res){
        if (err){
            log.error('creation tables [NOK]');
            log.error(sql);
            log.error(res);
            throw err;
        }
        log.trace('creation tables [OK]');
    });
}


async function updatePrices(cptThread){
    try {
        let requestDate = new Date();
        let requestDatetime = requestDate.getTime();    //timestamp

        // //========= ORG : PUBLIC API
        // const response = await got(URL_ACTUALS_PRICES);
        // let parsedResponse = JSON.parse(response.body);
        // let newLastPrices = new Array();
        // for(let i=0; i<parsedResponse.length; i++)
        // {
        //     if(parsedResponse[i].symbol.endsWith(CURRENCY_REFERENCE)) {
        //         newLastPrices.push({
        //             datetime: requestDatetime,
        //             symbol: parsedResponse[i].symbol,
        //             price: parsedResponse[i].price
        //         });
        //     }
        // }
        // console.log('newLastPrices ORG');
        // console.log(newLastPrices);
        // //=========


        //1) https://scanner.tradingview.com/crypto/scan
        //2) selectionner BINANCE comme exchange
        //3) Onglet overview, trier par rating decroissant, rechercher BTC
        //4) F12 console onglet network recuperer requete json
        //let formData = `{"filter":[{"left":"Recommend.All|15","operation":"nempty"},{"left":"exchange","operation":"equal","right":"BINANCE"},{"left":"change|15","operation":"in_range","right":[0,1e+100]}],"symbols":{"query":{"types":[]}},"columns":["name","close|15","change|15","change_abs|15","high|15","low|15","volume|15","Recommend.All|15","exchange","description","name","subtype"],"sort":{"sortBy":"Recommend.All|15","sortOrder":"desc"},"options":{"lang":"en"},"range":[0,50]}`;
        let formData = `{"filter":[{"left":"exchange","operation":"nempty"},{"left":"exchange","operation":"equal","right":"BINANCE"},{"left":"change|15","operation":"in_range","right":[0,1e+100]},{"left":"Recommend.All|15","operation":"nequal","right":0.5},{"left":"Recommend.All|15","operation":"in_range","right":[0.5,1]},{"left":"name,description","operation":"match","right":"`;
        formData += CURRENCY_REFERENCE + `"}],"symbols":{"query":{"types":[]}},"columns":["name","close|15","change|15","change_abs|15","high|15","low|15","volume|15","Recommend.All|15","exchange","description","name","subtype"],"sort":{"sortBy":"exchange","sortOrder":"desc"},"options":{"lang":"en"},"range":[0,50]}`;
        //formData = JSON.parse(formData);
        //const response = await got('https://scanner.tradingview.com/crypto/scan',{json:true, query:formData});

        $.ajax({
            url: 'https://scanner.tradingview.com/crypto/scan',
            dataType: 'json',
            type: 'POST',
            contentType: 'application/json',
            data: formData,
            success: function(r){
                if(typeof r.totalCount === 'undefined'){
                    r.totalCount = 0;
                }
                if(r.totalCount === 0){
                    //bot.position.leave(bestCurrency, 'NO MORE STRONG BUY CURRENCY');
                    //... ONLY FOR STRAT strongBuyCurrency
                }else{
                    let strongBuyCurrency = '';
                    for(let i=0 ; i< r.totalCount ; i++){
                        //log.trace(r.data[i].d);
                        if(readPair(r.data[i].d[0], 'tradingViewScanner.1') === bestCurrency){
                            strongBuyCurrency = bestCurrency;
                        }
                    }
                    if(strongBuyCurrency === ''){
                        strongBuyCurrency = readPair(r.data[0].d[0], 'tradingViewScanner.2'); //i:0
                    }
                    //maj global var
                    //-- DISABLED FOR TEST ETHUSDT ONLY
                    //-- bestCurrencyNew = strongBuyCurrency;
                }

            },
            error: function( jqXhr, textStatus, errorThrown ){
                log.error( errorThrown );
            }
        });


        //update currentPrice and refreshStats
        if(USE_DATABASE === false)
        {
            let priceOf;
            if(bot.inPosition) priceOf = bot.position.currentShitCoin;
            else priceOf = bot.position.previousShitCoin;

            if(priceOf !== ''){
                bot.position.priceCurrent = await getPrice(priceOf);
                bot.refreshStats();
            }
            //else: wait for first trade
        }



        binance.prices(function(response){
            //... dans try catch api binance ...

            let responseDate = new Date();
            let newLastPrices = []; //as: new Array()

            if(typeof response !== 'object'){
                EXCEPTION('CANT_UPDATE_PRICES', 'EXCHANGE WEBSITE DOESNT RESPOND OR PARSER FAIL');
            }

            for (let key in response) {
                if(key.endsWith(CURRENCY_REFERENCE)) {
                    let pushedData = {
                        datetime: requestDatetime,
                        symbol: key,
                        price: response[key]
                    };
                    newLastPrices.push(pushedData);
                }
            }

            //calc average prices up or down:
            //TODO
            //log.diag(lastPrices);
            //log.diag(newLastPrices);


            //update global variable:
            lastPrices = newLastPrices;


            if(USE_DATABASE)
            {
                //refresh stats :
                bot.position.priceCurrent = getPrice(bot.position.currentShitCoin);
                bot.refreshStats();

                //insert in database :
                database.query({
                    name: 'insert-ticks', //pg prepared statements
                    text: 'INSERT INTO ticks(datetime) VALUES($1)',
                    values: [requestDatetime]
                }).catch(function(e){
                    log.error(e.stack)
                });


                let sqlInsert = bulkInsert('prices', newLastPrices);
                database.query(sqlInsert).catch(function(e){
                    log.error(e.stack);
                    log.error('sqlInsert:');
                    log.error(sqlInsert);
                });

            }


            //== log exchange response time ==
            let message = '';
            if(typeof cptThread !== 'undefined'){
                message = '['+ cptThread +'] ';
            }
            message += '!! PRICES UPDATED !!  (exchange api response in '+ diffDateSeconds(requestDate, responseDate) +' secs';
            message += ', database insert in '+ diffDateSeconds(responseDate, new Date()) +' secs)';
            log.trace(message);
            //================================

            return true;
        });


    } catch (error) {
        log.error('updatePrices error :');
        log.error(error);
        return false;
    }
}


function sqlCreateTables(){
    /*
        -- DROP TABLE public.prices;
        -- DROP TABLE public.ticks;
        -- DROP TABLE public.orders;
     */
    let sql = `
    CREATE SEQUENCE IF NOT EXISTS prices_id_seq;
    CREATE SEQUENCE IF NOT EXISTS ticks_id_seq;
    CREATE SEQUENCE IF NOT EXISTS orders_id_seq;
    CREATE TABLE IF NOT EXISTS public.prices
    (
        id integer NOT NULL DEFAULT nextval('prices_id_seq'::regclass),
        datetime bigint,
        symbol character varying(255) COLLATE pg_catalog."default",
        price double precision,
        CONSTRAINT prices_pkey PRIMARY KEY (id)
    )
    WITH (
        OIDS = FALSE
    )
    TABLESPACE pg_default;
    ALTER TABLE public.prices OWNER to postgres;
    
    CREATE TABLE IF NOT EXISTS public.ticks
    (
        id integer NOT NULL DEFAULT nextval('ticks_id_seq'::regclass),
        datetime bigint,
        CONSTRAINT ticks_pkey PRIMARY KEY (id)
    )
    WITH (
        OIDS = FALSE
    )
    TABLESPACE pg_default;
    ALTER TABLE public.ticks OWNER to postgres;
    
    CREATE TABLE IF NOT EXISTS public.orders
    (
        id integer NOT NULL DEFAULT nextval('orders_id_seq'::regclass),
        datetime bigint,
        action character varying(255) COLLATE pg_catalog."default",
        symbol character varying(255) COLLATE pg_catalog."default",
        price double precision,
        quantity double precision,
        CONSTRAINT orders_pkey PRIMARY KEY (id)
    )
    WITH (
        OIDS = FALSE
    )
    TABLESPACE pg_default;
    ALTER TABLE public.orders OWNER to postgres;
    `;
    return sql;
}

function sqlPricesVariations(params){
    //SQL to get 4 best currency for last : 0-1 mins, 1-5 mins, 5-10 mins, 10-15 mins
    // ,(J1.price-J2.price)*100/J2.price AS p0
    // ,(J1.price-J3.price)*100/J3.price AS p1
    // ,(J3.price-J4.price)*100/J4.price AS p1To5
    // ,(J4.price-J5.price)*100/J5.price AS p5To10
    // ,(J5.price-J6.price)*100/J6.price AS p10To15
    // never /0 but we had CASE to handle it :
    let sql = `SELECT T1.*
        ,(CASE WHEN J2.price>0 THEN (J1.price-J2.price)*100/J2.price ELSE -999 END) AS p0
        ,(CASE WHEN J3.price>0 THEN (J1.price-J3.price)*100/J3.price ELSE -999 END) AS p1
        ,(CASE WHEN J4.price>0 THEN (J3.price-J4.price)*100/J4.price ELSE -999 END) AS p1To5
        ,(CASE WHEN J5.price>0 THEN (J4.price-J5.price)*100/J5.price ELSE -999 END) AS p5To10
        ,(CASE WHEN J6.price>0 THEN (J5.price-J6.price)*100/J6.price ELSE -999 END) AS p10To15
        FROM
        (
            SELECT
            prices.symbol,
            MAX(datetime) AS endDatetime
            FROM prices
            WHERE datetime >= `+ params.p0_Start +`
            GROUP BY symbol
        ) T1
        JOIN prices J1 ON J1.symbol=T1.symbol AND J1.datetime=T1.endDatetime
        JOIN prices J2 ON J2.symbol=T1.symbol AND J2.datetime=`+ params.p0_Start +`
        JOIN prices J3 ON J3.symbol=T1.symbol AND J3.datetime=`+ params.p1_Start +`
        JOIN prices J4 ON J4.symbol=T1.symbol AND J4.datetime=`+ params.p1To5_Start +`
        JOIN prices J5 ON J5.symbol=T1.symbol AND J5.datetime=`+ params.p5To10_Start +`
        JOIN prices J6 ON J6.symbol=T1.symbol AND J6.datetime=`+ params.p10To15_Start +`
        ORDER BY p0 DESC`;

    return sql;
}


function fees(){
    let EXCHANGE_FEES = 0.1; //binance % (-50% discount first year if BNB used)
    return (EXCHANGE_FEES/100);
}
function feesSubstract(amount){
    let newAmount = amount*(1-fees());
    log.trace('feesSubstract('+ amount +') => '+ newAmount);
    return newAmount;
}
function feesAdd(amount){
    let newAmount = amount*(1+fees());
    log.trace('feesAdd('+ amount +') => '+ newAmount);
    return newAmount;
}







//=================================================================
//https://stackoverflow.com/questions/42613227/express-node-postgres-pass-an-object-with-multiple-values-to-insert-query
function invert(obj) {
    let new_obj = [];
    // iterate over props
    for (let prop in obj) {
        // iterate over columns
        for(let i=0;i<obj[prop].length;i++) {
            // if a row exists, assign value to it
            if (new_obj[i]) {
                new_obj[i][prop] = obj[prop][i];
            } else {
                // if it doesn't, create it
                let row = {};
                row[prop] = obj[prop][i];
                new_obj.push(row);
            }
        }
    }
    return new_obj;
}
function bulkInsert(table, rows) {
    let params = [];
    let chunks = [];
    let statement = 'INSERT INTO ' + table + '(';
    for (let prop in rows[0]) {
        statement += prop + ',';
    }
    statement = statement.slice(0,-1) + ') VALUES ';
    for(let i = 0; i < rows.length; i++) {
        let row = rows[i];
        let valueClause = [];
        for (let prop in row) {
            params.push(row[prop]);
            valueClause.push('$' + params.length);
        }
        chunks.push('(' + valueClause.join(', ') + ')');
    }
    return {
        text: statement + chunks.join(', '),
        values: params
    }
}
//=================================================================


//########################################################################################################
let cpt = 0;
let timeout_loop = function run_again(){
    log.trace('['+ cpt +'] Lancement boucle');
    //## START LOOP ##

    thread(cpt);

    //## END LOOP ##
    cpt += 1;
    setTimeout( run_again, 1000*NB_SECONDS_BETWEEN_API_CALL);
};

timeout_loop();






//====================