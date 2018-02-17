document.addEventListener("DOMContentLoaded", function(event) {
    var scriptJquery = document.createElement("script");
    scriptJquery.src = "https://code.jquery.com/jquery-3.2.1.min.js";
    scriptJquery.onload = scriptJquery.onreadystatechange = function() {

        $(function() {
			//---------- PAGE READY ----------
            globalVarTest="ACCESSIBLE IN WEBVIEW";
            var localVarTest="ACCESSIBLE IN THAT ANONYMOUS FUNCTION ONLY";

            var login = 'jTrodeuh';
            var password = 'bigPassword';
            var graphUrl = 'https://www.tradingview.com/chart/bJNasads';
            var tabTible = 'TradingViewHooks';
            var graphLegendSelector = ".pane-legend-line.pane-legend-wrap.study";

            const { ipcRenderer } = require('electron');
            ipcRenderer.send('show-message', 'injector.js loaded into '+ window.location.href);

            function waitForElement(selector, callback) {
                if (!jQuery(selector).size()) {
                    setTimeout(function() {
                        window.requestAnimationFrame(function(){ waitForElement(selector, callback) });
                    }, 100);
                }else {
                    callback();
                }
            }


            function localizeElement(jQuerySelector){
                var $btn = $(jQuerySelector).first();
                var offset = $btn.offset();
                let centerX = Math.round(offset.left + $btn.width()/2);
                let centerY = Math.round(offset.top + $btn.height()/2);

                //console.log("localizeElement() BTN OFFSET left:"+offset.left+" top:"+offset.top+" centerX:"+centerX+" centerY:"+centerY);
                return {centerX:centerX, centerY:centerY};
            }


            function localizeAndClick(jQuerySelector, nbClick, msBetweenClick, finalCallBack){
                /* Exemples :
                        svg.move-left-button-control-bar
                        svg.zoom-out-right-button-control-bar
                        svg.turn-button-control-bar
                        svg.zoom-in-button-control-bar
                        svg.move-right-button-control-bar
                */
                if(typeof nbClick == 'undefined') nbClick = 1;
                if(typeof msBetweenClick == 'undefined') msBetweenClick = 300;
                waitForElement(jQuerySelector, function () {
                    let posBtn = localizeElement(jQuerySelector);
                    let mouseMove = {type: 'mouseMove', x: posBtn.centerX, y: posBtn.centerY};
                    let mouseDown = {type:'mouseDown', x:posBtn.centerX, y:posBtn.centerY, button:'left', clickCount: 1};
                    let mouseUp = {type:'mouseUp', x:posBtn.centerX, y:posBtn.centerY, button:'left', clickCount: 1};
                    let nbClickZoom = 0;
                    let intervalIdentifier = setInterval(function(){
                        ipcRenderer.send('send-input-event', mouseMove);
                        ipcRenderer.send('send-input-event', mouseDown);
                        ipcRenderer.send('send-input-event', mouseUp);
                        nbClickZoom++;
                        if(nbClickZoom >= nbClick){
                            window.clearInterval(intervalIdentifier);
                            if(typeof finalCallBack === 'function') {
                                finalCallBack();
                            }
                        }
                    }, msBetweenClick);
                });
            }

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
            //=========================================================


            //START catchGraphValues FUNCTION
            let catchGraphValues = {
                msBetweenEachCall: 100,
                fonc: function() {
                    //console.log('LOOP EXEC catchGraphValues (msBetweenEachCall:'+ catchGraphValues.msBetweenEachCall +')');
                    var results = null;
                    var legend = $(graphLegendSelector);    //global var
                    if(legend.length < 2) {
                        console.log("ERROR catchGraphValues legend.length < 1");
                    }else{
                        var legendItems = legend.eq(1).find(".pane-legend-item-value");
                        if(legendItems.length !== 2) {
                            console.log("ERROR catchGraphValues legendItems.length !== 2");
                        }else{
                            var fieldSMA = legendItems.eq(0);
                            var fieldDP0 = legendItems.eq(1);
                            var valueSMA = fieldSMA.html();
                            var valueDP0 = fieldDP0.html();
                            //warning value can be: 'n/a' at loading, also test for empty string
                            if(!$.isNumeric(valueSMA) || !$.isNumeric(valueDP0)) {
                                console.log("WAIT catchGraphValues (legends are currently not numeric/catchable)");
                            }else{

                                results = {
                                    SMA: valueSMA,
                                    DP0: valueDP0,
                                    timestamp: new Date()
                                }
                                ipcRenderer.send('graph-new-values', results);

                                //Flag legend as catched :
                                fieldSMA.html('CATCHED['+ valueSMA +']');
                                fieldDP0.html('CATCHED['+ valueDP0 +']');

                                //Canvas (graph image)
                                //var secondChart = $('.chart-markup-table.pane').eq(1);
                                //var canvasDraw = secondChart.find('canvas').eq(0);
                                //var canvasCursor = secondChart.find('canvas').eq(1);
                            }
                        }
                    }
                    let posBtn = localizeElement('svg.move-right-button-control-bar');
                    let mouseMove = {type: 'mouseMove', x: posBtn.centerX, y: posBtn.centerY};
                    //play in a 70x70 square away from buttons :
                    mouseMove.x += 20 + Math.round(70*Math.random());
                    mouseMove.y -= 20 + Math.round(70*Math.random());
                    ipcRenderer.send('send-input-event', mouseMove);
                    setTimeout(catchGraphValues.fonc, catchGraphValues.msBetweenEachCall); //infinite recursion
                },
                init: function(msBetweenEachCall){
                    if(typeof msBetweenEachCall != 'undefined'){
                        catchGraphValues.msBetweenEachCall = msBetweenEachCall;
                    }
                    catchGraphValues.fonc();
                }
            };
            //END catchGraphValues FUNCTION


            var tabUrl = window.location.href;

            switch(tabUrl){
                case 'https://www.tradingview.com/':
                    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                    function withConnectedUser(){
                        ipcRenderer.send('change-url', graphUrl);
                    }
                    //test if electron already logged or not:
                    var displayLogin = $("span.js-username").first().text();
                    if(displayLogin != login){
                        $('a[href="#signin"]').first().trigger("click");
                        var loginFormSelector = 'form[action="/accounts/signin/"]';
                        waitForElement(loginFormSelector, function(){
                            var form = $(loginFormSelector).first();
                            form.find("input[name='username']").first().val(login);
                            form.find("input[name='password']").first().val(password);
                            form.find("button[type='submit']").first().trigger("click");
                            withConnectedUser();
                        })
                    }else{
                        withConnectedUser();
                    }
                    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                break;
                case 'https://www.tradingview.com/anySpecific':
                    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                    console.log("!! Treatements for anySpecific url !!");
                    //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                break;
                default:
                    if(tabUrl.startsWith("https://www.tradingview.com/chart/")) {
                        //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                        let styleOverride = `<style>
                        .control-bar--hidden {
                            visibility: visible !important;
                            opacity: 1.0 !important;
                        }
                        .prevent-user-input {
                            position: absolute;
                            height: 100%;
                            width: 100%;
                            background-color: #000;
                            left: 0;
                            top: 0;
                            z-index: 9999;
                            opacity: 0.4;
                        }
                        </style>`;
                        $(styleOverride).appendTo('head');
                        $('<div class="prevent-user-input" style="width:40%"></div>').appendTo('body');

                        waitForElement(graphLegendSelector, function () {
                            setTimeout(function() {

                                localizeAndClick("svg.zoom-in-button-control-bar", 20, 300, function(){
                                    localizeAndClick("svg.move-right-button-control-bar", 14, 300, function(){
                                        //final callback :
                                        catchGraphValues.init(400); //every xxx ms
                                    });
                                });

                                /* //=== DIAG ONLY ===
                                $(window).mousemove(function(e){
                                    var coords = ' p[' + e.pageX + ';' + e.pageY + '] c[' + e.clientX + ';' + e.clientY + ']';
                                    if(e.pageX==e.clientX && e.pageY==e.clientY){
                                        coords = ' [' + e.pageX + ';' + e.pageY + ']';
                                    }
                                    var newTabTitle = tabTible+coords;
                                    ipcRenderer.send('change-title', newTabTitle);
                                    //show the fake cursor below the real one:
                                    ipcRenderer.send('send-input-event', {type: 'mouseMove', x: e.pageX, y: e.pageY});
                                });
                                //================= */

                            },4000);  //wait graph fully loaded
                        });
                        //~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                    }
                    else{
                        console.log("!! UNDEFINED ACTION (URL: "+ tabUrl +") !!");
                    }
            }


        });
    };
    document.body.appendChild(scriptJquery);


});
