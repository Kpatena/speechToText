(function e(t, n, r) {
    function s(o, u) {
        if (!n[o]) {
            if (!t[o]) {
                var a = typeof require == "function" && require;
                if (!u && a) return a(o, !0);
                if (i) return i(o, !0);
                var f = new Error("Cannot find module '" + o + "'");
                throw f.code = "MODULE_NOT_FOUND", f
            }
            var l = n[o] = {
                exports: {}
            };
            t[o][0].call(l.exports, function(e) {
                var n = t[o][1][e];
                return s(n ? n : e)
            }, l, l.exports, e, t, n, r)
        }
        return n[o].exports
    }
    var i = typeof require == "function" && require;
    for (var o = 0; o < r.length; o++) s(r[o]);
    return s
})({
    1: [function(require, module, exports) {
        "use strict";
        var utils = require("./utils");

        function Microphone(_options) {
            var options = _options || {};
            this.bufferSize = options.bufferSize || 8192;
            this.inputChannels = options.inputChannels || 1;
            this.outputChannels = options.outputChannels || 1;
            this.recording = false;
            this.requestedAccess = false;
            this.sampleRate = 16e3;
            this.bufferUnusedSamples = new Float32Array(0);
            if (!navigator.getUserMedia) {
                navigator.getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia
            }
        }
        Microphone.prototype.onPermissionRejected = function() {
            console.log("Microphone.onPermissionRejected()");
            this.requestedAccess = false;
            this.onError("Permission to access the microphone rejeted.")
        };
        Microphone.prototype.onError = function(error) {
            console.log("Microphone.onError():", error)
        };
        Microphone.prototype.onMediaStream = function(stream) {
            var AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) throw new Error("AudioContext not available");
            if (!this.audioContext) this.audioContext = new AudioCtx;
            var gain = this.audioContext.createGain();
            var audioInput = this.audioContext.createMediaStreamSource(stream);
            audioInput.connect(gain);
            this.mic = this.audioContext.createScriptProcessor(this.bufferSize, this.inputChannels, this.outputChannels);
            console.log("Microphone.onMediaStream(): sampling rate is:", this.sampleRate);
            this.mic.onaudioprocess = this._onaudioprocess.bind(this);
            this.stream = stream;
            gain.connect(this.mic);
            this.mic.connect(this.audioContext.destination);
            this.recording = true;
            this.requestedAccess = false;
            this.onStartRecording()
        };
        Microphone.prototype._onaudioprocess = function(data) {
            if (!this.recording) {
                return
            }
            var chan = data.inputBuffer.getChannelData(0);
            this.onAudio(this._exportDataBufferTo16Khz(new Float32Array(chan)))
        };
        Microphone.prototype.record = function() {
            if (!navigator.getUserMedia) {
                this.onError("Browser doesn't support microphone input");
                return
            }
            if (this.requestedAccess) {
                return
            }
            this.requestedAccess = true;
            navigator.getUserMedia({
                audio: true
            }, this.onMediaStream.bind(this), this.onPermissionRejected.bind(this))
        };
        Microphone.prototype.stop = function() {
            if (!this.recording) return;
            this.recording = false;
            this.stream.stop();
            this.requestedAccess = false;
            this.mic.disconnect(0);
            this.mic = null;
            this.onStopRecording()
        };
        Microphone.prototype._exportDataBufferTo16Khz = function(bufferNewSamples) {
            var buffer = null,
                newSamples = bufferNewSamples.length,
                unusedSamples = this.bufferUnusedSamples.length;
            if (unusedSamples > 0) {
                buffer = new Float32Array(unusedSamples + newSamples);
                for (var i = 0; i < unusedSamples; ++i) {
                    buffer[i] = this.bufferUnusedSamples[i]
                }
                for (i = 0; i < newSamples; ++i) {
                    buffer[unusedSamples + i] = bufferNewSamples[i]
                }
            } else {
                buffer = bufferNewSamples
            }
            var filter = [-.037935, -89024e-8, .040173, .019989, .0047792, -.058675, -.056487, -.0040653, .14527, .26927, .33913, .26927, .14527, -.0040653, -.056487, -.058675, .0047792, .019989, .040173, -89024e-8, -.037935],
                samplingRateRatio = this.audioContext.sampleRate / 16e3,
                nOutputSamples = Math.floor((buffer.length - filter.length) / samplingRateRatio) + 1,
                pcmEncodedBuffer16k = new ArrayBuffer(nOutputSamples * 2),
                dataView16k = new DataView(pcmEncodedBuffer16k),
                index = 0,
                volume = 32767,
                nOut = 0;
            for (var i = 0; i + filter.length - 1 < buffer.length; i = Math.round(samplingRateRatio * nOut)) {
                var sample = 0;
                for (var j = 0; j < filter.length; ++j) {
                    sample += buffer[i + j] * filter[j]
                }
                sample *= volume;
                dataView16k.setInt16(index, sample, true);
                index += 2;
                nOut++
            }
            var indexSampleAfterLastUsed = Math.round(samplingRateRatio * nOut);
            var remaining = buffer.length - indexSampleAfterLastUsed;
            if (remaining > 0) {
                this.bufferUnusedSamples = new Float32Array(remaining);
                for (i = 0; i < remaining; ++i) {
                    this.bufferUnusedSamples[i] = buffer[indexSampleAfterLastUsed + i]
                }
            } else {
                this.bufferUnusedSamples = new Float32Array(0)
            }
            return new Blob([dataView16k], {
                type: "audio/l16"
            })
        };
        var resampler = function(sampleRate, audioBuffer, callbackProcessAudio) {
            console.log("length: " + audioBuffer.length + " " + sampleRate);
            var channels = 1;
            var targetSampleRate = 16e3;
            var numSamplesTarget = audioBuffer.length * targetSampleRate / sampleRate;
            var offlineContext = new OfflineAudioContext(channels, numSamplesTarget, targetSampleRate);
            var bufferSource = offlineContext.createBufferSource();
            bufferSource.buffer = audioBuffer;
            offlineContext.oncomplete = function(event) {
                var samplesTarget = event.renderedBuffer.getChannelData(0);
                console.log("Done resampling: " + samplesTarget.length + " samples produced");
                var index = 0;
                var volume = 32767;
                var pcmEncodedBuffer = new ArrayBuffer(samplesTarget.length * 2);
                var dataView = new DataView(pcmEncodedBuffer);
                for (var i = 0; i < samplesTarget.length; i++) {
                    dataView.setInt16(index, samplesTarget[i] * volume, true);
                    index += 2
                }
                callbackProcessAudio(new Blob([dataView], {
                    type: "audio/l16"
                }))
            };
            bufferSource.connect(offlineContext.destination);
            bufferSource.start(0);
            offlineContext.startRendering()
        };
        var exportDataBuffer = function(buffer, bufferSize) {
            var pcmEncodedBuffer = null,
                dataView = null,
                index = 0,
                volume = 32767;
            pcmEncodedBuffer = new ArrayBuffer(bufferSize * 2);
            dataView = new DataView(pcmEncodedBuffer);
            for (var i = 0; i < buffer.length; i++) {
                dataView.setInt16(index, buffer[i] * volume, true);
                index += 2
            }
            return new Blob([dataView], {
                type: "audio/l16"
            })
        };
        Microphone.prototype._exportDataBuffer = function(buffer) {
            utils.exportDataBuffer(buffer, this.bufferSize)
        };
        Microphone.prototype.onStartRecording = function() {};
        Microphone.prototype.onStopRecording = function() {};
        Microphone.prototype.onAudio = function() {};
        module.exports = Microphone
    }, {
        "./utils": 7
    }],
    2: [function(require, module, exports) {
        module.exports = {
            models: [{
                url: "https://stream.watsonplatform.net/speech-to-text/api/v1/models/en-US_BroadbandModel",
                rate: 16e3,
                name: "en-US_BroadbandModel",
                language: "en-US",
                description: "US English broadband model (16KHz)"
            }, {
                url: "https://stream.watsonplatform.net/speech-to-text/api/v1/models/en-US_NarrowbandModel",
                rate: 8e3,
                name: "en-US_NarrowbandModel",
                language: "en-US",
                description: "US English narrowband model (8KHz)"
            }, {
                url: "https://stream.watsonplatform.net/speech-to-text/api/v1/models/es-ES_BroadbandModel",
                rate: 16e3,
                name: "es-ES_BroadbandModel",
                language: "es-ES",
                description: "Spanish broadband model (16KHz)"
            }, {
                url: "https://stream.watsonplatform.net/speech-to-text/api/v1/models/es-ES_NarrowbandModel",
                rate: 8e3,
                name: "es-ES_NarrowbandModel",
                language: "es-ES",
                description: "Spanish narrowband model (8KHz)"
            }, {
                url: "https://stream.watsonplatform.net/speech-to-text/api/v1/models/ja-JP_BroadbandModel",
                rate: 16e3,
                name: "ja-JP_BroadbandModel",
                language: "ja-JP",
                description: "Japanese broadband model (16KHz)"
            }, {
                url: "https://stream.watsonplatform.net/speech-to-text/api/v1/models/ja-JP_NarrowbandModel",
                rate: 8e3,
                name: "ja-JP_NarrowbandModel",
                language: "ja-JP",
                description: "Japanese narrowband model (8KHz)"
            }, {
                url: "https://stream.watsonplatform.net/speech-to-text/api/v1/models/pt-BR_BroadbandModel",
                rate: 16e3,
                name: "pt-BR_BroadbandModel",
                language: "pt-BR",
                description: "Brazilian Portuguese broadband model (16KHz)"
            }, {
                url: "https://stream.watsonplatform.net/speech-to-text/api/v1/models/pt-BR_NarrowbandModel",
                rate: 8e3,
                name: "pt-BR_NarrowbandModel",
                language: "pt-BR",
                description: "Brazilian Portuguese narrowband model (8KHz)"
            }, {
                url: "https://stream.watsonplatform.net/speech-to-text/api/v1/models/zh-CN_BroadbandModel",
                rate: 16e3,
                name: "zh-CN_BroadbandModel",
                language: "zh-CN",
                description: "Mandarin broadband model (16KHz)"
            }, {
                url: "https://stream.watsonplatform.net/speech-to-text/api/v1/models/zh-CN_NarrowbandModel",
                rate: 8e3,
                name: "zh-CN_NarrowbandModel",
                language: "zh-CN",
                description: "Mandarin narrowband model (8KHz)"
            }]
        }
    }, {}],
    3: [function(require, module, exports) {
        "use strict";
        var display = require("./views/displaymetadata");
        var initSocket = require("./socket").initSocket;
        exports.handleFileUpload = function(token, model, file, contentType, callback, onend) {
            localStorage.setItem("currentlyDisplaying", true);
            $.subscribe("progress", function(evt, data) {
                console.log("progress: ", data)
            });
            console.log("contentType", contentType);
            var baseString = "";
            var baseJSON = "";
            $.subscribe("showjson", function() {
                var $resultsJSON = $("#resultsJSON");
                $resultsJSON.empty();
                $resultsJSON.append(baseJSON)
            });
            var options = {};
            options.token = token;
            options.message = {
                action: "start",
                "content-type": contentType,
                interim_results: true,
                continuous: true,
                word_confidence: true,
                timestamps: true,
                max_alternatives: 3,
                inactivity_timeout: 600
            };
            options.model = model;

            function onOpen() {
                console.log("Socket opened")
            }

            function onListening(socket) {
                console.log("Socket listening");
                callback(socket)
            }

            function onMessage(msg) {
                if (msg.results) {
                    baseString = display.showResult(msg, baseString, model);
                    baseJSON = display.showJSON(msg, baseJSON)
                }
            }

            function onError(evt) {
                localStorage.setItem("currentlyDisplaying", false);
                onend(evt);
                console.log("Socket err: ", evt.code)
            }

            function onClose(evt) {
                localStorage.setItem("currentlyDisplaying", false);
                onend(evt);
                console.log("Socket closing: ", evt)
            }
            initSocket(options, onOpen, onListening, onMessage, onError, onClose)
        }
    }, {
        "./socket": 6,
        "./views/displaymetadata": 9
    }],
    4: [function(require, module, exports) {
        "use strict";
        var initSocket = require("./socket").initSocket;
        var display = require("./views/displaymetadata");
        exports.handleMicrophone = function(token, model, mic, callback) {
            if (model.indexOf("Narrowband") > -1) {
                var err = new Error("Microphone transcription cannot accomodate narrowband models, " + "please select another");
                callback(err, null);
                return false
            }
            $.publish("clearscreen");
            var baseString = "";
            var baseJSON = "";
            $.subscribe("showjson", function() {
                var $resultsJSON = $("#resultsJSON");
                $resultsJSON.empty();
                $resultsJSON.append(baseJSON)
            });
            var options = {};
            options.token = token;
            options.message = {
                action: "start",
                "content-type": "audio/l16;rate=16000",
                interim_results: true,
                continuous: true,
                word_confidence: true,
                timestamps: true,
                max_alternatives: 3,
                inactivity_timeout: 600
            };
            options.model = model;

            function onOpen(socket) {
                console.log("Mic socket: opened");
                callback(null, socket)
            }

            function onListening(socket) {
                mic.onAudio = function(blob) {
                    if (socket.readyState < 2) {
                        socket.send(blob)
                    }
                }
            }

            function onMessage(msg) {
                if (msg.results) {
                    baseString = display.showResult(msg, baseString, model);
                    baseJSON = display.showJSON(msg, baseJSON)
                }
            }

            function onError() {
                console.log("Mic socket err: ", err)
            }

            function onClose(evt) {
                console.log("Mic socket close: ", evt)
            }
            initSocket(options, onOpen, onListening, onMessage, onError, onClose)
        }
    }, {
        "./socket": 6,
        "./views/displaymetadata": 9
    }],
    5: [function(require, module, exports) {
        "use strict";
        var models = require("./data/models.json").models;
        var utils = require("./utils");
        utils.initPubSub();
        var initViews = require("./views").initViews;
        var showerror = require("./views/showerror");
        var showError = showerror.showError;
        window.BUFFERSIZE = 8192;
        $(document).ready(function() {
            var tokenGenerator = utils.createTokenGenerator();
            tokenGenerator.getToken(function(err, token) {
                window.onbeforeunload = function() {
                    localStorage.clear()
                };
                if (!token) {
                    console.error("No authorization token available");
                    console.error("Attempting to reconnect...");
                    if (err && err.code) showError("Server error " + err.code + ": " + err.error);
                    else showError("Server error " + err.code + ": please refresh your browser and try again")
                }
                var viewContext = {
                    currentModel: "en-US_BroadbandModel",
                    models: models,
                    token: token,
                    bufferSize: BUFFERSIZE
                };
                initViews(viewContext);
                localStorage.setItem("models", JSON.stringify(models));
                localStorage.setItem("currentModel", "en-US_BroadbandModel");
                localStorage.setItem("sessionPermissions", "true");
                $.subscribe("clearscreen", function() {
                    $("#resultsText").text("");
                    $("#resultsJSON").text("");
                    $(".error-row").hide();
                    $(".notification-row").hide();
                    $(".hypotheses > ul").empty();
                    $("#metadataTableBody").empty()
                })
            })
        })
    }, {
        "./data/models.json": 2,
        "./utils": 7,
        "./views": 13,
        "./views/showerror": 18
    }],
    6: [function(require, module, exports) {
        "use strict";
        var utils = require("./utils");
        var showerror = require("./views/showerror");
        var showError = showerror.showError;
        var tokenGenerator = utils.createTokenGenerator();
        var initSocket = exports.initSocket = function(options, onopen, onlistening, onmessage, onerror, onclose) {
            var listening;

            function withDefault(val, defaultVal) {
                return typeof val === "undefined" ? defaultVal : val
            }
            var socket;
            var token = options.token;
            var model = options.model || localStorage.getItem("currentModel");
            var message = options.message || {
                action: "start"
            };
            var sessionPermissions = withDefault(options.sessionPermissions, JSON.parse(localStorage.getItem("sessionPermissions")));
            var sessionPermissionsQueryParam = sessionPermissions ? "0" : "1";
            var url = options.serviceURI || "wss://stream.watsonplatform.net/speech-to-text/api/v1/recognize?watson-token=";
            url += token + "&X-WDC-PL-OPT-OUT=" + sessionPermissionsQueryParam + "&model=" + model;
            console.log("URL model", model);
            try {
                socket = new WebSocket(url)
            } catch (err) {
                console.error("WS connection error: ", err)
            }
            socket.onopen = function() {
                listening = false;
                $.subscribe("hardsocketstop", function() {
                    console.log("MICROPHONE: close.");
                    socket.send(JSON.stringify({
                        action: "stop"
                    }));
                    socket.close()
                });
                $.subscribe("socketstop", function() {
                    console.log("MICROPHONE: close.");
                    socket.close()
                });
                socket.send(JSON.stringify(message));
                onopen(socket)
            };
            socket.onmessage = function(evt) {
                var msg = JSON.parse(evt.data);
                if (msg.error) {
                    showError(msg.error);
                    $.publish("hardsocketstop");
                    return
                }
                if (msg.state === "listening") {
                    if (!listening) {
                        onlistening(socket);
                        listening = true
                    } else {
                        console.log("MICROPHONE: Closing socket.");
                        socket.close()
                    }
                }
                onmessage(msg, socket)
            };
            socket.onerror = function(evt) {
                console.log("WS onerror: ", evt);
                showError("Application error " + evt.code + ": please refresh your browser and try again");
                $.publish("clearscreen");
                onerror(evt)
            };
            socket.onclose = function(evt) {
                console.log("WS onclose: ", evt);
                if (evt.code === 1006) {
                    console.log("generator count", tokenGenerator.getCount());
                    if (tokenGenerator.getCount() > 1) {
                        $.publish("hardsocketstop");
                        throw new Error("No authorization token is currently available")
                    }
                    tokenGenerator.getToken(function(err, token) {
                        if (err) {
                            $.publish("hardsocketstop");
                            return false
                        }
                        console.log("Fetching additional token...");
                        options.token = token;
                        initSocket(options, onopen, onlistening, onmessage, onerror, onclose)
                    });
                    return false
                }
                if (evt.code === 1011) {
                    console.error("Server error " + evt.code + ": please refresh your browser and try again");
                    return false
                }
                if (evt.code > 1e3) {
                    console.error("Server error " + evt.code + ": please refresh your browser and try again");
                    return false
                }
                $.unsubscribe("hardsocketstop");
                $.unsubscribe("socketstop");
                onclose(evt)
            }
        }
    }, {
        "./utils": 7,
        "./views/showerror": 18
    }],
    7: [function(require, module, exports) {
        (function(global) {
            "use strict";
            var $ = typeof window !== "undefined" ? window["jQuery"] : typeof global !== "undefined" ? global["jQuery"] : null;
            var fileBlock = function(_offset, length, _file, readChunk) {
                var r = new FileReader;
                var blob = _file.slice(_offset, length + _offset);
                r.onload = readChunk;
                r.readAsArrayBuffer(blob)
            };
            exports.onFileProgress = function(options, ondata, running, onerror, onend, samplingRate) {
                var file = options.file;
                var fileSize = file.size;
                var chunkSize = options.bufferSize || 16e3;
                var offset = 0;
                var readChunk = function(evt) {
                    if (offset >= fileSize) {
                        console.log("Done reading file");
                        onend();
                        return
                    }
                    if (!running()) {
                        return
                    }
                    if (evt.target.error == null) {
                        var buffer = evt.target.result;
                        var len = buffer.byteLength;
                        offset += len;
                        ondata(buffer)
                    } else {
                        var errorMessage = evt.target.error;
                        console.log("Read error: " + errorMessage);
                        onerror(errorMessage);
                        return
                    }
                    if (samplingRate) {
                        setTimeout(function() {
                            fileBlock(offset, chunkSize, file, readChunk)
                        }, chunkSize * 1e3 / (samplingRate * 2))
                    } else {
                        fileBlock(offset, chunkSize, file, readChunk)
                    }
                };
                fileBlock(offset, chunkSize, file, readChunk)
            };
            exports.createTokenGenerator = function() {
                var hasBeenRunTimes = 0;
                return {
                    getToken: function(callback) {
                        ++hasBeenRunTimes;
                        if (hasBeenRunTimes > 5) {
                            var err = new Error("Cannot reach server");
                            callback(null, err);
                            return
                        }
                        var url = "/api/token";
                        var tokenRequest = new XMLHttpRequest;
                        tokenRequest.open("POST", url, true);
                        tokenRequest.setRequestHeader("csrf-token", $('meta[name="ct"]').attr("content"));
                        tokenRequest.onreadystatechange = function() {
                            if (tokenRequest.readyState === 4) {
                                if (tokenRequest.status === 200) {
                                    var token = tokenRequest.responseText;
                                    callback(null, token)
                                } else {
                                    var error = "Cannot reach server";
                                    if (tokenRequest.responseText) {
                                        try {
                                            error = JSON.parse(tokenRequest.responseText)
                                        } catch (e) {
                                            error = tokenRequest.responseText
                                        }
                                    }
                                    callback(error)
                                }
                            }
                        };
                        tokenRequest.send()
                    },
                    getCount: function() {
                        return hasBeenRunTimes
                    }
                }
            };
            exports.initPubSub = function() {
                var o = $({});
                $.subscribe = o.on.bind(o);
                $.unsubscribe = o.off.bind(o);
                $.publish = o.trigger.bind(o)
            }
        }).call(this, typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
    }, {}],
    8: [function(require, module, exports) {
        "use strict";
        exports.initAnimatePanel = function() {
            $(".panel-heading span.clickable").on("click", function() {
                if ($(this).hasClass("panel-collapsed")) {
                    $(this).parents(".panel").find(".panel-body").slideDown();
                    $(this).removeClass("panel-collapsed");
                    $(this).find("i").removeClass("caret-down").addClass("caret-up")
                } else {
                    $(this).parents(".panel").find(".panel-body").slideUp();
                    $(this).addClass("panel-collapsed");
                    $(this).find("i").removeClass("caret-up").addClass("caret-down")
                }
            })
        }
    }, {}],
    9: [function(require, module, exports) {
        "use strict";
        var scrolled = false,
            textScrolled = false;
        var showTimestamp = function(timestamps, confidences) {
            var word = timestamps[0],
                t0 = timestamps[1],
                t1 = timestamps[2];
            var displayConfidence = confidences ? confidences[1].toString().substring(0, 3) : "n/a";
            $("#metadataTable > tbody:last-child").append("<tr>" + "<td>" + word + "</td>" + "<td>" + t0 + "</td>" + "<td>" + t1 + "</td>" + "<td>" + displayConfidence + "</td>" + "</tr>")
        };
        var showMetaData = function(alternative) {
            var confidenceNestedArray = alternative.word_confidence;
            var timestampNestedArray = alternative.timestamps;
            if (confidenceNestedArray && confidenceNestedArray.length > 0) {
                for (var i = 0; i < confidenceNestedArray.length; i++) {
                    var timestamps = timestampNestedArray[i];
                    var confidences = confidenceNestedArray[i];
                    showTimestamp(timestamps, confidences)
                }
                return
            } else {
                if (timestampNestedArray && timestampNestedArray.length > 0) {
                    timestampNestedArray.forEach(function(timestamp) {
                        showTimestamp(timestamp)
                    })
                }
            }
        };
        var Alternatives = function() {
            var stringOne = "",
                stringTwo = "",
                stringThree = "";
            this.clearString = function() {
                stringOne = "";
                stringTwo = "";
                stringThree = ""
            };
            this.showAlternatives = function(alternatives, isFinal, testing) {
                var $hypotheses = $(".hypotheses ol");
                $hypotheses.empty();
                alternatives.forEach(function(alternative, idx) {
                    var $alternative;
                    if (alternative.transcript) {
                        var transcript = alternative.transcript.replace(/%HESITATION\s/g, "");
                        transcript = transcript.replace(/(.)\1{2,}/g, "");
                        switch (idx) {
                            case 0:
                                stringOne = stringOne + transcript;
                                $alternative = $("<li data-hypothesis-index=" + idx + " >" + stringOne + "</li>");
                                break;
                            case 1:
                                stringTwo = stringTwo + transcript;
                                $alternative = $("<li data-hypothesis-index=" + idx + " >" + stringTwo + "</li>");
                                break;
                            case 2:
                                stringThree = stringThree + transcript;
                                $alternative = $("<li data-hypothesis-index=" + idx + " >" + stringThree + "</li>");
                                break
                        }
                        $hypotheses.append($alternative)
                    }
                })
            }
        };
        var alternativePrototype = new Alternatives;
        exports.showJSON = function(msg, baseJSON) {
            var json = JSON.stringify(msg, null, 2);
            baseJSON += json;
            baseJSON += "\n";
            if ($(".nav-tabs .active").text() === "JSON") {
                $("#resultsJSON").append(baseJSON);
                baseJSON = "";
                console.log("updating json")
            }
            return baseJSON
        };

        function updateTextScroll() {
            if (!scrolled) {
                var element = $("#resultsText").get(0);
                element.scrollTop = element.scrollHeight
            }
        }
        var initTextScroll = function() {
            $("#resultsText").on("scroll", function() {
                textScrolled = true
            })
        };

        function updateScroll() {
            if (!scrolled) {
                var element = $(".table-scroll").get(0);
                element.scrollTop = element.scrollHeight
            }
        }
        var initScroll = function() {
            $(".table-scroll").on("scroll", function() {
                scrolled = true
            })
        };
        exports.initDisplayMetadata = function() {
            initScroll();
            initTextScroll()
        };
        exports.showResult = function(msg, baseString, model) {
            if (msg.results && msg.results.length > 0) {
                var alternatives = msg.results[0].alternatives;
                var text = msg.results[0].alternatives[0].transcript || "";
                text = text.replace(/%HESITATION\s/g, "");
                text = text.replace(/(.)\1{2,}/g, "");
                if (msg.results[0].final) console.log("-> " + text);
                text = text.replace(/D_[^\s]+/g, "");
                if (text.length === 0 || /^\s+$/.test(text)) {
                    return baseString
                }
                var japanese = model.substring(0, 5) === "ja-JP" || model.substring(0, 5) === "zh-CN";
                if (msg.results && msg.results[0] && msg.results[0].final) {
                    text = text.slice(0, -1);
                    text = text.charAt(0).toUpperCase() + text.substring(1);
                    if (japanese) {
                        text = text.trim() + "。";
                        text = text.replace(/ /g, "")
                    } else {
                        text = text.trim() + ". "
                    }
                    baseString += text;
                    $("#resultsText").val(baseString);
                    showMetaData(alternatives[0]);
                    alternativePrototype.showAlternatives(alternatives)
                } else {
                    if (japanese) {
                        text = text.replace(/ /g, "")
                    } else {
                        text = text.charAt(0).toUpperCase() + text.substring(1)
                    }
                    $("#resultsText").val(baseString + text)
                }
            }
            updateScroll();
            updateTextScroll();
            return baseString
        };
        $.subscribe("clearscreen", function() {
            var $hypotheses = $(".hypotheses ul");
            scrolled = false;
            $hypotheses.empty();
            alternativePrototype.clearString()
        })
    }, {}],
    10: [function(require, module, exports) {
        "use strict";
        var handleSelectedFile = require("./fileupload").handleSelectedFile;
        exports.initDragDrop = function(ctx) {
            var dragAndDropTarget = $(document);
            dragAndDropTarget.on("dragenter", function(e) {
                e.stopPropagation();
                e.preventDefault()
            });
            dragAndDropTarget.on("dragover", function(e) {
                e.stopPropagation();
                e.preventDefault()
            });
            dragAndDropTarget.on("drop", function(e) {
                console.log("File dropped");
                e.preventDefault();
                var evt = e.originalEvent;
                handleFileUploadEvent(evt)
            });

            function handleFileUploadEvent(evt) {
                var file = evt.dataTransfer.files[0];
                handleSelectedFile(ctx.token, file)
            }
        }
    }, {
        "./fileupload": 12
    }],
    11: [function(require, module, exports) {
        "use strict";
        exports.flashSVG = function(el) {
            el.css({
                fill: "#A53725"
            });

            function loop() {
                el.animate({
                    fill: "#A53725"
                }, 1e3, "linear").animate({
                    fill: "white"
                }, 1e3, "linear")
            }
            var timer = setTimeout(loop, 2e3);
            return timer
        };
        exports.stopFlashSVG = function(timer) {
            el.css({
                fill: "white"
            });
            clearInterval(timer)
        };
        exports.toggleImage = function(el, name) {
            if (el.attr("src") === "images/" + name + ".svg") {
                el.attr("src", "images/stop-red.svg")
            } else {
                el.attr("src", "images/stop.svg")
            }
        };
        var restoreImage = exports.restoreImage = function(el, name) {
            el.attr("src", "images/" + name + ".svg")
        };
        exports.stopToggleImage = function(timer, el, name) {
            clearInterval(timer);
            restoreImage(el, name)
        }
    }, {}],
    12: [function(require, module, exports) {
        "use strict";
        var showError = require("./showerror").showError;
        var showNotice = require("./showerror").showNotice;
        var handleFileUpload = require("../handlefileupload").handleFileUpload;
        var effects = require("./effects");
        var utils = require("../utils");
        var handleSelectedFile = exports.handleSelectedFile = function() {
            var running = false;
            localStorage.setItem("currentlyDisplaying", false);
            return function(token, file) {
                $.publish("clearscreen");
                localStorage.setItem("currentlyDisplaying", true);
                running = true;
                var uploadImageTag = $("#fileUploadTarget > img");
                var timer = setInterval(effects.toggleImage, 750, uploadImageTag, "stop");
                var uploadText = $("#fileUploadTarget > span");
                uploadText.text("Stop Transcribing");

                function restoreUploadTab() {
                    clearInterval(timer);
                    effects.restoreImage(uploadImageTag, "upload");
                    uploadText.text("Select File")
                }
                $.subscribe("hardsocketstop", function() {
                    restoreUploadTab();
                    running = false
                });
                var currentModel = localStorage.getItem("currentModel");
                console.log("currentModel", currentModel);
                var blobToText = new Blob([file]).slice(0, 4);
                var r = new FileReader;
                r.readAsText(blobToText);
                r.onload = function() {
                    var contentType;
                    if (r.result === "fLaC") {
                        contentType = "audio/flac";
                        showNotice("Notice: browsers do not support playing FLAC audio, so no audio will accompany the transcription")
                    } else if (r.result === "RIFF") {
                        contentType = "audio/wav";
                        var audio = new Audio;
                        var wavBlob = new Blob([file], {
                            type: "audio/wav"
                        });
                        var wavURL = URL.createObjectURL(wavBlob);
                        audio.src = wavURL;
                        audio.play();
                        $.subscribe("hardsocketstop", function() {
                            audio.pause();
                            audio.currentTime = 0
                        })
                    } else {
                        restoreUploadTab();
                        showError("Only WAV or FLAC files can be transcribed, please try another file format");
                        localStorage.setItem("currentlyDisplaying", false);
                        return
                    }
                    handleFileUpload(token, currentModel, file, contentType, function(socket) {
                        var blob = new Blob([file]);
                        var parseOptions = {
                            file: blob
                        };
                        utils.onFileProgress(parseOptions, function onData(chunk) {
                            socket.send(chunk)
                        }, function isRunning() {
                            if (running) return true;
                            else return false
                        }, function(evt) {
                            console.log("Error reading file: ", evt.message);
                            showError("Error: " + evt.message)
                        }, function() {
                            socket.send(JSON.stringify({
                                action: "stop"
                            }))
                        })
                    }, function() {
                        effects.stopToggleImage(timer, uploadImageTag, "upload");
                        uploadText.text("Select File");
                        localStorage.setItem("currentlyDisplaying", false)
                    })
                }
            }
        }();
        exports.initFileUpload = function(ctx) {
            var fileUploadDialog = $("#fileUploadDialog");
            fileUploadDialog.change(function() {
                var file = fileUploadDialog.get(0).files[0];
                handleSelectedFile(ctx.token, file)
            });
            $("#fileUploadTarget").click(function() {
                var currentlyDisplaying = JSON.parse(localStorage.getItem("currentlyDisplaying"));
                if (currentlyDisplaying) {
                    console.log("HARD SOCKET STOP");
                    $.publish("hardsocketstop");
                    localStorage.setItem("currentlyDisplaying", false);
                    return
                }
                fileUploadDialog.val(null);
                fileUploadDialog.trigger("click")
            })
        }
    }, {
        "../handlefileupload": 3,
        "../utils": 7,
        "./effects": 11,
        "./showerror": 18
    }],
    13: [function(require, module, exports) {
        "use strict";
        var initSessionPermissions = require("./sessionpermissions").initSessionPermissions;
        var initSelectModel = require("./selectmodel").initSelectModel;
        var initAnimatePanel = require("./animatepanel").initAnimatePanel;
        var initShowTab = require("./showtab").initShowTab;
        var initDragDrop = require("./dragdrop").initDragDrop;
        var initPlaySample = require("./playsample").initPlaySample;
        var initRecordButton = require("./recordbutton").initRecordButton;
        var initFileUpload = require("./fileupload").initFileUpload;
        var initDisplayMetadata = require("./displaymetadata").initDisplayMetadata;
        exports.initViews = function(ctx) {
            console.log("Initializing views...");
            initSelectModel(ctx);
            initPlaySample(ctx);
            initDragDrop(ctx);
            initRecordButton(ctx);
            initFileUpload(ctx);
            initSessionPermissions();
            initShowTab();
            initAnimatePanel();
            initShowTab();
            initDisplayMetadata()
        }
    }, {
        "./animatepanel": 8,
        "./displaymetadata": 9,
        "./dragdrop": 10,
        "./fileupload": 12,
        "./playsample": 14,
        "./recordbutton": 15,
        "./selectmodel": 16,
        "./sessionpermissions": 17,
        "./showtab": 19
    }],
    14: [function(require, module, exports) {
        "use strict";
        var utils = require("../utils");
        var onFileProgress = utils.onFileProgress;
        var handleFileUpload = require("../handlefileupload").handleFileUpload;
        var showError = require("./showerror").showError;
        var effects = require("./effects");
        var LOOKUP_TABLE = {
            "en-US_BroadbandModel": ["Us_English_Broadband_Sample_1.wav", "Us_English_Broadband_Sample_2.wav"],
            "en-US_NarrowbandModel": ["Us_English_Narrowband_Sample_1.wav", "Us_English_Narrowband_Sample_2.wav"],
            "es-ES_BroadbandModel": ["Es_ES_spk24_16khz.wav", "Es_ES_spk19_16khz.wav"],
            "es-ES_NarrowbandModel": ["Es_ES_spk24_8khz.wav", "Es_ES_spk19_8khz.wav"],
            "ja-JP_BroadbandModel": ["sample-Ja_JP-wide1.wav", "sample-Ja_JP-wide2.wav"],
            "ja-JP_NarrowbandModel": ["sample-Ja_JP-narrow3.wav", "sample-Ja_JP-narrow4.wav"],
            "pt-BR_BroadbandModel": ["pt-BR_Sample1-16KHz.wav", "pt-BR_Sample2-16KHz.wav"],
            "pt-BR_NarrowbandModel": ["pt-BR_Sample1-8KHz.wav", "pt-BR_Sample2-8KHz.wav"],
            "zh-CN_BroadbandModel": ["zh-CN_sample1_for_16k.wav", "zh-CN_sample2_for_16k.wav"],
            "zh-CN_NarrowbandModel": ["zh-CN_sample1_for_8k.wav", "zh-CN_sample2_for_8k.wav"]
        };
        var playSample = function() {
            var running = false;
            localStorage.setItem("currentlyDisplaying", false);
            return function(token, imageTag, iconName, url) {
                $.publish("clearscreen");
                var currentlyDisplaying = JSON.parse(localStorage.getItem("currentlyDisplaying"));
                console.log("CURRENTLY DISPLAYING", currentlyDisplaying);
                if (currentlyDisplaying) {
                    console.log("HARD SOCKET STOP");
                    $.publish("socketstop");
                    localStorage.setItem("currentlyDisplaying", false);
                    effects.stopToggleImage(timer, imageTag, iconName);
                    effects.restoreImage(imageTag, iconName);
                    running = false;
                    return
                }
                if (currentlyDisplaying && running) {
                    showError("Currently another file is playing, please stop the file or wait until it finishes");
                    return
                }
                localStorage.setItem("currentlyDisplaying", true);
                running = true;
                $("#resultsText").val("");
                var timer = setInterval(effects.toggleImage, 750, imageTag, iconName);
                var xhr = new XMLHttpRequest;
                xhr.open("GET", url, true);
                xhr.responseType = "blob";
                xhr.onload = function() {
                    var blob = xhr.response;
                    var currentModel = localStorage.getItem("currentModel") || "en-US_BroadbandModel";
                    var reader = new FileReader;
                    var blobToText = new Blob([blob]).slice(0, 4);
                    reader.readAsText(blobToText);
                    reader.onload = function() {
                        var contentType = reader.result === "fLaC" ? "audio/flac" : "audio/wav";
                        console.log("Uploading file", reader.result);
                        var mediaSourceURL = URL.createObjectURL(blob);
                        var audio = new Audio;
                        audio.src = mediaSourceURL;
                        audio.play();
                        $.subscribe("hardsocketstop", function() {
                            audio.pause();
                            audio.currentTime = 0
                        });
                        $.subscribe("socketstop", function() {
                            audio.pause();
                            audio.currentTime = 0
                        });
                        handleFileUpload(token, currentModel, blob, contentType, function(socket) {
                            var parseOptions = {
                                file: blob
                            };
                            var samplingRate = currentModel.indexOf("Broadband") != -1 ? 16e3 : 8e3;
                            onFileProgress(parseOptions, function onData(chunk) {
                                socket.send(chunk)
                            }, function isRunning() {
                                if (running) return true;
                                else return false
                            }, function(evt) {
                                console.log("Error reading file: ", evt.message)
                            }, function() {
                                socket.send(JSON.stringify({
                                    action: "stop"
                                }))
                            }, samplingRate)
                        }, function() {
                            effects.stopToggleImage(timer, imageTag, iconName);
                            effects.restoreImage(imageTag, iconName);
                            localStorage.getItem("currentlyDisplaying", false)
                        })
                    }
                };
                xhr.send()
            }
        }();
        exports.initPlaySample = function(ctx) {
            (function() {
                var fileName = "audio/" + LOOKUP_TABLE[ctx.currentModel][0];
                var el = $(".play-sample-1");
                el.off("click");
                var iconName = "play";
                var imageTag = el.find("img");
                el.click(function() {
                    playSample(ctx.token, imageTag, iconName, fileName, function(result) {
                        console.log("Play sample result", result)
                    })
                })
            })(ctx, LOOKUP_TABLE);
            (function() {
                var fileName = "audio/" + LOOKUP_TABLE[ctx.currentModel][1];
                var el = $(".play-sample-2");
                el.off("click");
                var iconName = "play";
                var imageTag = el.find("img");
                el.click(function() {
                    playSample(ctx.token, imageTag, iconName, fileName, function(result) {
                        console.log("Play sample result", result)
                    })
                })
            })(ctx, LOOKUP_TABLE)
        }
    }, {
        "../handlefileupload": 3,
        "../utils": 7,
        "./effects": 11,
        "./showerror": 18
    }],
    15: [function(require, module, exports) {
        "use strict";
        var Microphone = require("../Microphone");
        var handleMicrophone = require("../handlemicrophone").handleMicrophone;
        var showError = require("./showerror").showError;
        exports.initRecordButton = function(ctx) {
            var recordButton = $("#recordButton");
            recordButton.click(function() {
                var running = false;
                var token = ctx.token;
                var micOptions = {
                    bufferSize: ctx.buffersize
                };
                var mic = new Microphone(micOptions);
                return function(evt) {
                    evt.preventDefault();
                    var currentModel = localStorage.getItem("currentModel");
                    var currentlyDisplaying = JSON.parse(localStorage.getItem("currentlyDisplaying"));
                    if (currentlyDisplaying) {
                        showError("Currently another file is playing, please stop the file or wait until it finishes");
                        return
                    }
                    if (!running) {
                        $("#resultsText").val("");
                        console.log("Not running, handleMicrophone()");
                        handleMicrophone(token, currentModel, mic, function(err) {
                            if (err) {
                                var msg = "Error: " + err.message;
                                console.log(msg);
                                showError(msg);
                                running = false
                            } else {
                                recordButton.css("background-color", "#d74108");
                                recordButton.find("img").attr("src", "images/stop.svg");
                                console.log("starting mic");
                                mic.record();
                                running = true
                            }
                        })
                    } else {
                        console.log("Stopping microphone, sending stop action message");
                        recordButton.removeAttr("style");
                        recordButton.find("img").attr("src", "images/microphone.svg");
                        $.publish("hardsocketstop");
                        mic.stop();
                        running = false
                    }
                }
            }())
        }
    }, {
        "../Microphone": 1,
        "../handlemicrophone": 4,
        "./showerror": 18
    }],
    16: [function(require, module, exports) {
        "use strict";
        var initPlaySample = require("./playsample").initPlaySample;
        exports.initSelectModel = function(ctx) {
            ctx.models.forEach(function(model) {
                $("#dropdownMenuList").append($("<li>").attr("role", "presentation").append($("<a>").attr("role", "menu-item").attr("href", "/").attr("data-model", model.name).append(model.description)))
            });
            $("#dropdownMenuList").click(function(evt) {
                evt.preventDefault();
                evt.stopPropagation();
                console.log("Change view", $(evt.target).text());
                var newModelDescription = $(evt.target).text();
                var newModel = $(evt.target).data("model");
                $("#dropdownMenuDefault").empty().text(newModelDescription);

                $("#dropdownMenu1").dropdown("toggle");
                localStorage.setItem("currentModel", newModel);
                ctx.currentModel = newModel;
                initPlaySample(ctx);
                $.publish("clearscreen")
            })
        }
    }, {
        "./playsample": 14
    }],
    17: [function(require, module, exports) {
        "use strict";
        exports.initSessionPermissions = function() {
            console.log("Initializing session permissions handler");
            var sessionPermissionsRadio = $("#sessionPermissionsRadioGroup input[type='radio']");
            sessionPermissionsRadio.click(function() {
                var checkedValue = sessionPermissionsRadio.filter(":checked").val();
                console.log("checkedValue", checkedValue);
                localStorage.setItem("sessionPermissions", checkedValue)
            })
        }
    }, {}],
    18: [function(require, module, exports) {
        "use strict";
        exports.showError = function(msg) {
            console.log("Error: ", msg);
            var errorAlert = $(".error-row");
            errorAlert.hide();
            errorAlert.css("background-color", "#d74108");
            errorAlert.css("color", "white");
            var errorMessage = $("#errorMessage");
            errorMessage.text(msg);
            errorAlert.show();
            $("#errorClose").click(function(e) {
                e.preventDefault();
                errorAlert.hide();
                return false
            })
        };
        exports.showNotice = function(msg) {
            console.log("Notice: ", msg);
            var noticeAlert = $(".notification-row");
            noticeAlert.hide();
            noticeAlert.css("border", "2px solid #ececec");
            noticeAlert.css("background-color", "#f4f4f4");
            noticeAlert.css("color", "black");
            var noticeMessage = $("#notificationMessage");
            noticeMessage.text(msg);
            noticeAlert.show();
            $("#notificationClose").click(function(e) {
                e.preventDefault();
                noticeAlert.hide();
                return false
            })
        };
        exports.hideError = function() {
            var errorAlert = $(".error-row");
            errorAlert.hide()
        }
    }, {}],
    19: [function(require, module, exports) {
        "use strict";
        exports.initShowTab = function() {
            $('.nav-tabs a[data-toggle="tab"]').on("shown.bs.tab", function(e) {
                var target = $(e.target).text();
                if (target === "JSON") {
                    $.publish("showjson")
                }
            })
        }
    }, {}]
}, {}, [5]);