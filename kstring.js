define([], function() {
    
    /* This gets returned to the host as soon as the plugin is loaded */ 
    var pluginConf = {
        name: "KString",
        osc: false,
        audioIn: 0,
        audioOut: 1,
        version: '0.0.1-alpha1',
        ui: {
            type: 'div',
            width: 90,
            height: 180
        }
    }
  
    /* This gets called when all the resources are loaded */
    var pluginFunction = function (args) {
        
        this.name = args.name;
        this.id = args.id;

        // The UI part
        for (var i = 0; i < 6; i+=1) {
            var newDiv = document.createElement("div");
            newDiv.innerHTML = "&nbsp;&nbsp;";
            newDiv.setAttribute("style","font-family: Monospace; text-decoration: line-through; font-size: 24px; background-color: white");
            var newSpan = document.createElement("span");
            newSpan.innerHTML = "&nbsp;&nbsp;&nbsp;"
            var num = 5 - i;
            newSpan.id = 'tab'+ num.toString();
            newDiv.appendChild(newSpan);
            //var mainDiv = document.querySelector('#mainDiv');
            args.div.appendChild(newDiv);
        }

        // The sound part
        this.audioDestination = args.audioDestinations[0];
        this.context = args.audioContext;
        var context = this.context;
		
        var dest = this.audioDestination;
        var compressor = context.createDynamicsCompressor();
        compressor.connect(dest);
        dest = compressor;

        var low = context.createBiquadFilter();
        low.type = 'lowshelf';
        low.frequency.value = 400;
        low.gain.value = 15;
        var mid = context.createBiquadFilter();
        mid.type = 'peaking';
        mid.frequency.value = 1200;
        mid.gain.value = 5;
        var high = context.createBiquadFilter();
        high.type = 'highshelf';
        high.frequency.value = 2000;
        high.gain.value = -15;
        //
        high.connect(dest);
        mid.connect(high);
        low.connect(mid);
        var dest = low;

        var CURVE = new Float32Array(139);
        var distortion = context.createWaveShaper();
        for (var i = 0; i < CURVE.length; ++i) {
          var x = 2 * i / (CURVE.length-1) - 1;
          x *= 0.686306;
          var a = 1 + Math.exp(Math.sqrt(Math.abs(x)) * -0.75);
          CURVE[i] = (Math.exp(x) - Math.exp(-x * a)) / (Math.exp(x) + Math.exp(-x));
        }
        distortion.curve = CURVE;
        distortion.connect(dest);
        dest = distortion;


        function $(selector) { return document.querySelector(selector) }

        function createKarplusStrong(frequency) {
          // y[n] = x[n] + (y[n-N] + y[n-N-1]) / 2
          var node = context.createJavaScriptNode(512, 0, 1);
          var N = Math.round(context.sampleRate / frequency);
          var y = new Float32Array(N);
          var n = 0;
          node.t = 0;
          node.setFrequency = function (f, pluck) {
            var newN = Math.round(context.sampleRate / f);
            if (newN > N) {
              var newy = new Float32Array(newN);
              for (var i = 0; i < newN; ++i)
                newy[i] = y[n++ % N];
              frequency = f;
              y = newy;
            }
            N = newN;
            n = 0;
            if (pluck) {
              this.impulse = N / 3;
              this.gain = 0.995;
            }

          }
          node.gain = 1;
          node.impulse = 0;
          node.onaudioprocess = function (e) {
            var output = e.outputBuffer.getChannelData(0);
            for (var i = 0; i < e.outputBuffer.length; ++i) {
              var xn = (--this.impulse >= 0) ? Math.random()-0.5 : 0;
              output[i] = y[n] = xn + this.gain * (y[n] + y[(n + 1) % N]) / 2;
              if (++n >= N) n = 0;
              if (this.score && this.score.length && this.score[0][1] <= this.t)
                this.setFrequency(this.score.shift()[0], true);
              if (this.tab && this.tab.length && this.tab[0][0] <= this.t) {
                var rec = this.tab.shift();
                this.setFret(rec[1], rec[2]);
              }
              ++this.t;
            }
          }
          return node;
        }

        var strings = Array(6);
        for (var i = 0; i < strings.length; ++i) {
          strings[i] = createKarplusStrong(440);
          strings[i].connect(dest);
          strings[i].keys = {};
          strings[i].number = i;
          strings[i].tab = [];
          strings[i].setFret = function (n, pluck) {
            if (n < 0) {
              this.gain = 0.8;
              $('#tab' + this.number).innerHTML = '&nbsp;&nbsp;';
            } else {
              this.setFrequency(this.baseFreq * Math.pow(2, n/12), pluck);
              $('#tab' + this.number).innerHTML = (' ' + n).substr(-2);
            }
          };
        }

        // Rows on the keyboard represent four of the strings
        var frets = [
          [16, 90, 88, 67, 86, 66, 78, 77, 188, 190, 191],
          [17, 65, 83, 68, 70, 71, 72, 74, 75, 76, 186, 222, 13],
          [9, 81, 87, 69, 82, 84, 89, 85, 73, 79, 80, 219, 221, 220],
          [192, 49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 189, 187]
        ];
        strings[0].baseFreq = 82;
        var BASS = false;
        if (BASS) strings[0].baseFreq /= 2;
        var intervals = [5,5,5,4,5];
        for (var i = 1; i < strings.length; ++i)
          strings[i].baseFreq = strings[i-1].baseFreq * Math.pow(2, intervals[i-1]/12);
        var mapping = {};
        for (var s = 0; s < frets.length; ++s)
          for (var i = 0; i < frets[s].length; ++i)
            mapping[frets[s][i]] = [strings[s], i];

        var keysdown = {};
        var keys = [];
        args.div.addEventListener('keydown', function (event) {
          var key = event.keyCode;
          var c = String.fromCharCode(key);
          if (keysdown[key]) return;  // ignore key-repeats
          keysdown[key] = true;
          //console.log('KEYDOWN', key, c, event);
          if (key in mapping) {
            var string = mapping[key][0];
            var fret = mapping[key][1];
            var highest = Math.max.apply(null, Object.keys(string.keys));
            if (fret > highest)
              string.setFret(fret, highest <= 0);
            string.keys[fret] = true;
          }
          /*
          if (key === 219) music("3 e-AA#AqAe-G-F-eFqGF q'C e- qA q'C e- q'F", 150)
          if (key === 221) music("4 qC eDD EE FF qG eAA GG qC", 220);
          */
          event.preventDefault();
          return false;
        });

        args.div.addEventListener('keyup', function (event) {
          var key = event.keyCode;
          var c = String.fromCharCode(key);
          delete keysdown[key];
          if (key in mapping) {
            var string = mapping[key][0];
            var fret = mapping[key][1];
            delete string.keys[fret];
            var highest = Math.max.apply(null, Object.keys(string.keys));
            if (fret > highest)
              string.setFret(highest);
          }
        });


        // 
        // vx02220 ^x02220  Down-pick & up-pick chord
        // hp Hammer-on/pull-off
        // EADGBZ   choose string
        // 5 7 !2 $3   play fret (5, 7, 12, 23)
        // m  palmmute
        // w h q e s t  advance time whole, half, etc measure

        var r = 'v-799s v---- Em0s m0s m0s';
        var i = 'E-t 5t /E7s- A5e- E7s- A5e v-7999s vm----- Em0s m0s m0s' + r + r + r + r + r + 
          'v-7999s /v-2444 v----- ';
        var wholeLottaLove = 'T92 -s' + i + i;
        var scale = 'E0t /1t /2t 3e 4e m5e m6e 7e 8e -';

        var twee = 'A!0B!2e G0s B!2s A!0s B!2s G0e';
        var intro = 'E3B0e G0e A0B1e G0e A2B3e G0e ' + twee + twee;
        var bbv = 'A3B5e G0e A4B8e G0e A5B7e G0e A6B!0e G0e A7B8e G0s B8s A7s B8s G0e A6B8e G0s B8s A6s B8s G0e';
        var blackbird = 'T92 -q ' + intro + intro + bbv;

        var symptom = 'T160 E0e 2e -e D4e B2e G3e D4e v------B5e -e D4e B4e G4e v------D4e -e  B4e -e';
        symptom += symptom; 
        symptom += symptom; 

        function retab(composition) {
          for (var i = 0; i < strings.length; ++i) {
            strings[i].t = 0;
            strings[i].tab = [];
          }
          tab(composition);
        }

        function tab(composition) {
          var bpm = 120;
          var t = strings[0].t;
          var string = 0;
          var mute = false;
          var slide = false;
          var advance = 0;
          var strum = 0;
          for (var i = 0; i < composition.length; ++i) {
            var c = composition[i];
            console.log(i, c, string);
            var tens = 0;
            if (c === '!') {
              tens = 10;
              c = composition[++i];
            } else if (c === '$') {
              tens = 20;
              c = composition[++i];
            }
            function note(fret) {
              console.log('NOTE', t, string, fret);
              if (advance) {
                var beatsPerSecond = bpm / 60;
                var samplesPerBeat = context.sampleRate / beatsPerSecond;
                t += advance * samplesPerBeat;
                advance = 0;
              }
              if (typeof fret === 'number') {
                fret += tens;
                strings[string].tab.push([t, fret, !slide]);
              }
              if (mute) {
                strings[string].tab.push([t + 1, -1, false]);
                mute = false;
              }
              if (strum) {
                string += strum;
                if (string === 0 || string === 5) strum = 0;
              }
              if (!strum)
                slide = false;
            }
            switch (c) {
            case '0': case '1': case '2': case '3': case '4': 
            case '5': case '6': case '7': case '8': case '9': 
              note(c.charCodeAt(0) - '0'.charCodeAt(0)); break;
            case '-': note(-1); break;
            case 'E': strum = 0; string = 0; break;
            case 'A': strum = 0; string = 1; break;
            case 'D': strum = 0; string = 2; break;
            case 'G': strum = 0; string = 3; break;
            case 'B': strum = 0; string = 4; break;
            case 'Z': strum = 0; string = 5; break;
            case 'm': mute = true; break;
            case '/': slide = true; break;
            case 'w': advance = 4; break;
            case 'h': advance = 2; break;
            case 'q': advance = 1; break;
            case 'e': advance = 1/2; break;
            case 's': advance = 1/4; break;
            case 't': advance = 1/8; break;
            case '.': advance *= 3/2; break;
            case '%': advance *= 2/3; break;
            case 'v': strum = 1; string = 0; break;
            case '^': strum = -1; string = 5; break;
            case 'T':
              bpm = 0;
              for (++i; '0' <= composition[i] && composition[i] <= '9'; ++i) 
                bpm = bpm * 10 + composition.charCodeAt(i) - '0'.charCodeAt(0);
              break;
            }
          }
        }

        // w whole
        // h half
        // q quarter
        // e eighth
        // s sixteenth
        // t thirty-second
        // . dotted
        // % triplet
        // ' up octave (next note only)
        // , down octave (next note only)
        // # sharp (#C)
        // b flat (bB)
        // 4 (or other numeral) set octave (persistent)
        // A through F  play a node in that tone
        // - rest
        function music(composition, bpm) {
          bpm = bpm || 120;
          var notes = [];
          var duration = 1;
          var totalDuration = 0;
          var octave = 4;
          var modifier = 0;
          function note(tone) {
            var beatsPerSecond = bpm / 60;
            var samplesPerBeat = context.sampleRate / beatsPerSecond;
            if (typeof tone !== 'undefined') {
              var f = 16.352 * Math.pow(2, octave + (tone + modifier)/12);
              notes.push([f, totalDuration * samplesPerBeat]);
            }
            totalDuration += duration;
            modifier = 0;
          }
          for (var i = 0; i < composition.length; ++i) {
            var c = composition[i];
            if (c === 'w') duration = 4;
            if (c === 'h') duration = 2;
            if (c === 'q') duration = 1;
            if (c === 'e') duration = 1/2;
            if (c === 's') duration = 1/4;
            if (c === 't') duration = 1/8;
            if (c === '.') duration *= 3/2;
            if (c === '%') duration *= 2/3;
            if (c === "'") modifier += 12;
            if (c === ',') modifier -= 12;
            if (c === 'C') note(0);
            if (c === 'D') note(2);
            if (c === 'E') note(4);
            if (c === 'F') note(5);
            if (c === 'G') note(7);
            if (c === 'A') note(9);
            if (c === 'B') note(11);
            if (c === '-') note();
            if (c === '#') modifier++;
            if (c === 'b') modifier--;
            if ('0' <= c && c <= '9') octave = c.charCodeAt(0) - '0'.charCodeAt(0);
          }
          T = 0;
          SCORE = notes;
        }


        // Initialization made it so far: plugin is ready.
        args.hostInterface.setInstanceStatus ('ready');
        
  	};
  
  
    /* This function gets called by the host every time an instance of
       the plugin is requested [e.g: displayed on screen] */        
    var initPlugin = function(initArgs) {
        var args = initArgs;
        pluginFunction.call (this, args);
    };
    
    return {
        initPlugin: initPlugin,
        pluginConf: pluginConf
    };
});