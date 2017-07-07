/*
 * License Text.
 * Authors: Sriram Narasimhan
 */

/** Define a SpellingBeeHelper namespace */
SPH = {};

// wordlistManager manages the words in all wordlists.
SPH.wordListManager = new function() {
  this.lists = {};
  this.currentList = null;
  this.init = function() {
    this.element = $("#words-container");
    this.listElement = $("#words-list-container");
    this.setupClickHandlers();
  };
  this.setupClickHandlers = function() {
    var self = this;
    $(":input[name= 'filter']").on('change', function(){
      var clicked = $(this).val();
      if (clicked == "all") {
        $("li[data-icon]").show();
      } else {
        $("li[data-icon]").hide();
        $("li[data-icon='audio']").show();
      }
    });
    $(document).on("tap", "#check-answer", function(e) {
      self.checkAnswer();
    });
    $(document).on("keypress", "#answer", function(e) {
      if (e.which === 13) {
        self.checkAnswer();
        e.preventDefault();
      }
    });
    $(document).on("tap", "#next-word", function(e) {
      self.showPractice();
    });
    $(document).on("swipeleft", "#practice", function() {
      self.showPractice();
    });
    $(document).on("swiperight", "#practice", function() {
      self.showPractice();
    });
  };
  this.checkAnswer = function() {
    var input = $("#answer");
    var answer = input.val();
    var actual = $("#reveal-answer").data("word");
    var icon = "delete";
    var backgroundColor = "red";
    if (actual == answer) {
      icon = "check";
      backgroundColor = "green";
    }
    var html = '<a style="background: ';
    html += backgroundColor;
    html += '; color: white;" class="ui-btn ui-icon-';
    html += icon;
    html += ' ui-btn-icon-right">';
    html += actual;
    html += '</a>';
    $("#reveal-answer").empty().append(html);
  };
  this.showPractice = function() {
    var element = $("#practice");
    element.show();
    element.empty();
    if (this.currentList) {
      this.currentList.showRandomPracticeWord(element);
    } else {
      element.append("<h1>select a wordlist first</h1>");
    }
  };
  this.showWords = function() {
    var element = this.element;
    var listElement = this.listElement;
    if (this.currentList) {
      this.currentList.show(element, listElement);
      var clicked = $(":input[name= 'filter']").val();
      if (clicked == "all") {
        $("li[data-icon]").show();
      } else {
        $("li[data-icon]").hide();
        $("li[data-icon='audio']").show();
      }
    } else {
      element.show();
      listElement.empty();
      listElement.append("<h1>select a wordlist first</h1>");
    }
  };
  this.add = function(name, permalink) {
    var self = this;
    if (!(name in self.lists)) {
      self.lists[name] = new SPH.wordList(name, permalink);
    }
    SPH.loadingDialog.show("loading words in " + name);
    self.lists[name].load()
    .then(function(data) {
      self.currentList = self.lists[name];
      var attributeName = "theme";
      $('[data-permalink]').data(attributeName, "a").attr("data-" + attributeName, "a").removeClass("ui-body-b").addClass("ui-body-a");
      $('[data-permalink="' + self.currentList.permalink + '"]').data(attributeName, "b").attr("data-" + attributeName, "b").removeClass("ui-body-a").addClass("ui-body-b");
      SPH.loadingDialog.hide();
    })
    .catch(function(error) {
      SPH.loadingDialog.hide();
      SPH.messageDialog.show(error.message);
    });
  };
};

SPH.wordList = function(name, permalink) {
  this.name = name;
  this.permalink = permalink;
  this.words = null;
  this.wordsWithAudio = [];
  this.error = null;
  this.showRandomPracticeWord = function(element) {
    var self = this;
    if (self.wordsWithAudio.length > 0) {
      var min = 0;
      var max = self.wordsWithAudio.length - 1;
      var index = Math.floor(Math.random()*(max-min+1)+min);;
      var word = self.wordsWithAudio[index];
      var html = "";
      html += '<label for="basic">Enter word spelling:</label>';
      html += '<input type="text" name="name" id="answer" value="" data-mini="true" data-clear-btn="true">';
      html += '<button id="check-answer" class="ui-btn ui-btn-inline ui-mini ui-shadow ui-corner-all">Check</button>';
      html += '<button id="next-word" class="ui-btn ui-btn-inline ui-mini ui-shadow ui-corner-all">Next Word</button>';
      html += SPH.wordManager.getPracticeWordHTML(word);
      element.append(html);
    } else {
      element.append("<h1>No words with audio found</h1>");
    }
  };
  this.show = function(element, listElement) {
    var self = this;
    element.show();
    listElement.empty();
    if(!self.words) {
      listElement.append("<h1>The list of words has not been loaded.</h1>");
      if (self.error) {
        listElement.append("<h2>" + self.error.message + "</h2>");
      }
    } else {
      var html = "";
      html += '<ul id="words" data-type="content" data-role="listview" data-inset="true">';
      $.each(self.words, function( index, value ) {
        var word = value.word;
        var li = "<li ";
        if (SPH.wordManager.hasAudio(word)) {
          li += "data-icon='audio'";
        } else {
          li += "data-icon='false'";
        }
        li += " data-word='" + word + "' data-type='word'>";
        li += '<a href="#" data-theme="b">';
        li += word;
        li += "</a>"
        li += "</li>";
        html += li;
      });
      html += "</ul>";
      listElement.append(html);
      $("#words").listview().listview('refresh');
    }
  };
  this.load = function() {
    var self = this;
    var promise = new Promise(function(resolve, reject) {
      if (self.words) return resolve(self.words);
      var url = "http://api.wordnik.com:80/v4/wordList.json/" + self.permalink + "/words";
      var data = {
        skip: 0,
        limit: 1000,
      };
      SPH.user.getURL(url, data)
      .then(function(data) {
        self.words = data;
        var promises = [];
        $.each(data, function( index, value ) {
          var word = value.word;
          promises.push(SPH.wordManager.add(word));
        });
        Promise.all(promises)
        .then(function() {
          self.wordsWithAudio = [];
          $.each(self.words, function( index, value ) {
            var word = value.word;
            if (SPH.wordManager.hasAudio(word)) {
              self.wordsWithAudio.push(word);
            }
          });
          resolve(data);
        });
      })
      .catch(function(error) {
        self.error = error;
        reject(error);
      });
    });
    return promise;
  };
};

/**
 * wordManager manages all words.
 */
SPH.wordManager = new function() {
  this.words = {};
  this.init = function() {
    this.element = $("#word");
    this.setupClickHandlers();
  };
  this.setupClickHandlers = function() {
    var self = this;
    $(document).on("tap", "[data-type='word']", function(e) {
      var word = $(this).data("word");
      $("#words-container").hide();
      self.showWord(word);
    });
  };
  this.hasAudio = function(name) {
    var self = this;
    if (!(name in self.words)) return false;
    return self.words[name].hasAudio();
  };
  this.getPracticeWordHTML = function(name) {
    var self = this;
    if (!(name in self.words)) {
      return "<h1>Word: " + name + " is not loaded";
    }
    return self.words[name].toHTML(true, false);
  };
  this.showWord = function(name) {
    var self = this;
    var element = self.element;
    if (!(name in self.words)) {
      element.empty().append("<h1>Word: " + name + " is not loaded");
      element.show();
      return;
    }
    element.empty().append(self.words[name].toHTML(false, true));
    element.show();
  };
  this.add = function(name) {
    var self = this;
    var promise = new Promise(function(resolve, reject) {
      if (name in self.words) return resolve(self.words[name]);
      self.words[name] = new SPH.word(name);
      self.words[name].load()
      .then(function(data) {
        resolve(data);
      })
      .catch(function(error) {
        resolve(error);
      });
    });
    return promise;
  };
};

// word is information about one word.
SPH.word = function(name) {
  this.name = name;
  this.googleAudio = [];
  this.wordnikAudio = [];
  this.merriamWebsterAudio = [];
  this.definitions = [];
  this.hasAudio = function() {
    var self = this;
    return self.googleAudio.length > 0 || self.wordnikAudio.length > 0 || self.merriamWebsterAudio.length > 0;
  };
  this.toHTML = function(autoplay, showName) {
    var self = this;
    var html = "";
    if (showName) {
      html += "<h1>";
      html += self.name;
      html += "</h1>";
    } else {
      html += "<div id='reveal-answer' data-word='" + self.name + "'></div>";
    }
    if (!self.hasAudio()) {
      html += "<div>No audio found</div>";
    }
    var autoplaySelected = false;
    if (self.googleAudio.length > 0) {
      $.each(self.googleAudio, function( index, value ) {
        html += '<audio controls ';
        if (autoplay && !autoplaySelected) {
          html += "autoplay";
          autoplaySelected = true;
        }
        html += '><source src="' + value.fileUrl + '" type="audio/mpeg"></audio>';
      });
    } else if (self.merriamWebsterAudio.length > 0) {
      $.each(self.merriamWebsterAudio, function( index, value ) {
        html += '<audio controls ';
        if (autoplay && !autoplaySelected) {
          html += "autoplay";
          autoplaySelected = true;
        }
        html += '><source src="' + value.fileUrl + '" type="audio/wav"></audio>';
      });
    } else if (self.wordnikAudio.length > 0) {
      SPH.loadingDialog.show("Loading wordnik Audio " + self.name);
      self.loadWordnikAudio()
      .then(function(data) {
        $.each(self.wordnikAudio, function( index, value ) {
          html += '<audio controls ';
          if (autoplay && !autoplaySelected) {
            html += "autoplay";
            autoplaySelected = true;
          }
          html += '><source src="' + value.fileUrl + '" type="audio/mpeg"></audio>';
        });
        SPH.loadingDialog.hide();
      })
      .catch(function(error) {
        html += "<div>No audio found</div>";
        SPH.loadingDialog.hide();
      });
    }
    var definitions = self.wordnikDefinitions;
    if (!definitions || definitions.length < 1) {
      html += "<div>No definitions found</div>";
    } else {
      $.each(definitions, function( index, value ) {
        html += "<div>(" + value.partOfSpeech + ") " + value.text + "</div>";
      });
    }
    return html;
  };
  this.load = function() {
    var self = this;
    var promises = [];
    promises.push(self.loadAudio());
    promises.push(self.loadWordnikDefinitions());
    var promise = new Promise(function(resolve, reject) {
      Promise.all(promises)
      .then(function(data) {
        resolve(data);
      });
    });
    return promise;
  };
  this.loadWordnikDefinitions = function () {
    var self = this;
    var promise = new Promise(function(resolve, reject) {
      SPH.user.getURL("http://api.wordnik.com:80/v4/word.json/" + self.name + "/definitions", {})
      .then(function(data) {
        self.wordnikDefinitions = data;
        resolve(data);
      })
      .catch(function(error) {
        resolve(error);
      });
    });
    return promise;
  };
  this.loadMerriamWebsterEntry = function(prefix, key) {
    var self = this;
    var promise = new Promise(function(resolve, reject) {
      var request = $.ajax({
        method: "GET",
        dataType: "xml",
        url: "http://www.dictionaryapi.com/api/v1/references/" + prefix + "/xml/" + self.name + "?key=" + key,
        timeout: 10000,
      });
      request.done(function(data) {
        var xml = $(data);
        var entry = xml.find('entry[id="' + self.name + '"]');
        if (!entry) return resolve(data);
        var sound = entry.find('sound');
        if (!sound) return resolve(data);
        var wav = sound.find('wav');
        if (!wav) return resolve(data);
        var wavFile = wav.text();
        if (wavFile) {
          var fileUrl = "http://media.merriam-webster.com/soundc11/" + wavFile.charAt(0) + "/" + wavFile;
          self.merriamWebsterAudio.push({
            'fileUrl': fileUrl,
          });
          resolve(data);
        }
        reject(data);
      });
      request.fail( function(jqXHR, textStatus, errorThrown) {
        var message = "Error - " + textStatus + ": " + errorThrown;
        reject(new Error(message));
      });
    });
    return promise;
  };
  this.loadGoogle2Audio = function() {
    var self = this;
    var fileUrl = "http://www.gstatic.com/dictionary/static/sounds/de/0/" + self.name + ".mp3";
    var promise = new Promise(function(resolve, reject) {
      var request = $.ajax({
        method: "GET",
        url : "http://spellingbeehelper.appspot.com/urlexists?url=" + fileUrl,
        timeout: 10000,
      });
      request.done(function(data) {
        if (data.exists) {
          self.googleAudio.push({
            'fileUrl': fileUrl,
          });
          return resolve(fileUrl);
        }
        reject(new Error("google2 audio not found"));
      });
      request.fail( function(jqXHR, textStatus, errorThrown) {
        var message = "Error - " + textStatus + ": " + errorThrown;
        reject(new Error(message));
      });
    });
    return promise;
  };
  this.loadGoogleAudio = function() {
    var self = this;
    var fileUrl = "https://ssl.gstatic.com/dictionary/static/sounds/oxford/" + self.name + "--_us_1.mp3";
    var promise = new Promise(function(resolve, reject) {
      var request = $.ajax({
        method: "GET",
        url : "http://spellingbeehelper.appspot.com/urlexists?url=" + fileUrl,
        timeout: 10000,
      });
      request.done(function(data) {
        if (data.exists) {
          self.googleAudio.push({
            'fileUrl': fileUrl,
          });
          return resolve(fileUrl);
        }
        reject(new Error("google audio not found"));
      });
      request.fail( function(jqXHR, textStatus, errorThrown) {
        var message = "Error - " + textStatus + ": " + errorThrown;
        reject(new Error(message));
      });
    });
    return promise;
  };
  this.loadWordnikAudio = function() {
    var self = this;
    var promise = new Promise(function(resolve, reject) {
      SPH.user.getURL("http://api.wordnik.com:80/v4/word.json/" + self.name + "/audio", {})
      .then(function(data) {
        self.wordnikAudio = data;
        if (data.length > 0) {
          return resolve(data);
        }
        reject(new Error("No Audio"));
      })
      .catch(function(error) {
        reject(error);
      });
    });
    return promise;
  };
  this.loadAudio = function() {
    var self = this;
    var promise = new Promise(function(resolve, reject) {
      self.loadGoogleAudio()
      .then(function(data) {
        resolve(data);
      })
      .catch(function(error) {
        self.loadGoogle2Audio()
        .then(function(data) {
          resolve(data);
        })
        .catch(function(error) {
          self.loadWordnikAudio()
          .then(function(data) {
            resolve(data);
          })
          .catch(function(error) {
            self.loadMerriamWebsterEntry("sd4", "26e14c56-3fef-4f55-9947-58488d5a1a24")
            .then(function(data) {
              return resolve(data);
            })
            .catch(function(error) {
              self.loadMerriamWebsterEntry("sd3", "f8c5fbfc-a08d-47b1-9494-06b8d70b8f38")
              .then(function(data) {
                resolve(data);
              })
              .catch(function(error) {
                resolve(false);
              });
            });
          });
        });
      });
    });
    return promise;
  };
};

// wordLists manage the list of wordlists.
SPH.wordLists = new function() {
  this.wordListsData = null;
  this.lists = {};
  this.error = null;
  this.init = function() {
    this.element = $("#wordlists");
    this.view = $("#wordlists").listview();
    this.setupClickHandlers();
  };
  this.setupClickHandlers = function() {
    var self = this;
    $(document).on("tap", "[data-type='wordlist']", function(e) {
      var permalink = $(this).data("permalink");
      var name = $(this).data("name");
      SPH.wordListManager.add(name, permalink);
    });
  };
  this.show = function() {
    var self = this;
    var element = self.element
    element.empty();
    element.show();
    if(!self.wordListsData) {
      element.append("<li>The list of wordlists has not been loaded.</li>");
      if (self.error) {
        element.append("<li>" + self.error.message + "</li>");
      }
    } else {
      $.each(self.wordListsData, function( index, value ) {
        var theme = "a";
        if (SPH.wordListManager.currentList && value.permalink == SPH.wordListManager.currentList.permalink) {
          theme = "b";
        }
        var li = "<li data-theme='" + theme + "' data-name='" + value.name + "' data-type='wordlist' data-permalink='" + value.permalink + "'>";
        li += value.name;
        li += ' <span class="ui-li-count">';
        li += value.numberWordsInList;
        li += "</span></li>";
        element.append(li);
      });
    }
    self.view.listview('refresh');
  };
  this.load = function() {
    var self = this;
    var promise = new Promise(function(resolve, reject) {
      if (self.wordListsData) return resolve(self.wordListsData);
      SPH.user.getURL("http://api.wordnik.com/v4/account.json/wordLists")
      .then(function(data) {
        self.wordListsData = data;
        resolve(data);
      })
      .catch(function(error) {
        self.error = error;
        reject(error);
      });
    });
    return promise;
  };
};

/**
 * The initialize function. Called only once when the app starts.
 */
SPH.app = new function() {
  this.start = function() {
    // Checking for cordova and jQM has to go after initialize because they will call it
    // Wait for cordova
    var cordovaReady = $.Deferred();
    document.addEventListener( "deviceready", cordovaReady.resolve, false );

    // Wait for jQueryMobile
    var jQueryMobileReady = $.Deferred();
    $( document ).bind( "pagecreate", function() {
      // Dont initialize pages
      // $.mobile.autoInitialize = false;
      // In order to respect data-enhance=false attributes
    	$.mobile.ignoreContentEnabled = true;
      jQueryMobileReady.resolve();
    });
    var self = this;
    // Both events have fired.
    // Added a hack to check if running in browser and not mobile app
    // This hack is to allow testing on browser where deviceready event will not fire
    if ( this.isCordovaApp() ) {
    	$.when( cordovaReady, jQueryMobileReady ).then( this.init.bind(this) );
    }
    else {
      $.when( jQueryMobileReady ).then( this.init.bind(this) );
    }
  };
  this.init = function() {
    if ( navigator && navigator.splashscreen ) {
      navigator.splashscreen.hide();
    }
    this.initDialogs();
    SPH.wordLists.init();
    SPH.wordListManager.init();
    SPH.wordManager.init();
    this.setupClickHandlers();
    $("[data-type='content']").hide();
    this.loadWordLists();
  };
  this.loadWordLists = function() {
    SPH.wordLists.load()
    .then(function(data) {
      SPH.wordLists.show();
    })
    .catch(function(error){
      SPH.wordLists.show();
    });
  };
  this.setupClickHandlers = function() {
    var self = this;
    $(document).on("tap", "[data-type='navbar']", function(e) {
      var name = $(this).data("name");
      $("[data-type='content']").hide();
      switch(name) {
        case "load-wordlist":
          self.loadWordLists();
          break;
        case "show-words":
          SPH.wordListManager.showWords();
          break;
        case "practice":
          SPH.wordListManager.showPractice();
          break;
      };
    });
  };
  this.initDialogs = function() {
    SPH.loadingDialog = new SPH.dialog("loading-popup", true);
    SPH.messageDialog = new SPH.dialog("message-popup", true);
  };
  /**
   * Utility function to check if running in a browser as oppose to mobile app.
   */
  this.isCordovaApp = function() {
  	return ( window.cordova || window.PhoneGap );
  };
};
// Start the app
SPH.app.start();

/**
 * A class to manage showing and hiding dialogs.
 */
SPH.dialog = function(container) {
  this.container = container;
  $("#" + this.container).on("popupafterclose", function() {
    $("#all-content").removeClass("ui-disabled");
  });
  $("#" + this.container).on("popupafteropen", function() {
    $("#all-content").addClass("ui-disabled");
  });
  this.showWithConfirmation = function(text, yesCallback, noCallback) {
    var self = this;
    $("#all-content").addClass("ui-disabled");
    $("#" + this.container + "-content").empty().append(text);
    $(document).one("tap", "#" + container + "-yes", function() {
      $(document).off("tap", "#" + container + "-yes");
      $(document).off("tap", "#" + container + "-no");
      self.hide();
      if (yesCallback) yesCallback();
      return false;
    });
    $(document).one("tap", "#" + container + "-no", function() {
      $(document).off("tap", "#" + container + "-yes");
      $(document).off("tap", "#" + container + "-no");
      self.hide();
      if (noCallback) noCallback();
      return false;
    });
  	$("#" + this.container).popup("open");
  };
  this.show = function(text) {
    $("#all-content").addClass("ui-disabled");
    $("#" + this.container + "-content").empty().append(text);
  	$("#" + this.container).popup("open");
  };
  this.hide = function() {
    $("#" + this.container).popup("close");
    $("#all-content").removeClass("ui-disabled");
  }
};

SPH.user = new function() {
  this.apiKey = "a2a73e7b926c924fad7001ca3111acd55af2ffabf50eb4ae5";
  this.authToken = null;
  this.getAuthToken = function() {
    var self = this;
    var promise = new Promise(function(resolve, reject) {
      if (self.authToken) return resolve(self.authToken.token);
      var request = $.ajax({
        method: "GET",
        url: "http://api.wordnik.com:80/v4/account.json/authenticate/deepasriram",
        data: {
          password: "sunshine",
          api_key: 'a2a73e7b926c924fad7001ca3111acd55af2ffabf50eb4ae5',
        },
        timeout: 10000,
      });
    	request.done(function(data) {
        self.authToken = data;
        resolve(data.token);
    	});
    	request.fail( function(jqXHR, textStatus, errorThrown) {
        var message = "Error - " + textStatus + ": " + errorThrown;
        reject(new Error(message));
    	});
    });
    return promise;
  };
  this.getURL = function(url, data) {
    var self = this;
    data = data || {};
    var promise = new Promise(function(resolve, reject) {
      self.getAuthToken()
      .then(function(token) {
        var request = $.ajax({
          method: "GET",
          url: url,
          data: $.extend({
            api_key: 'a2a73e7b926c924fad7001ca3111acd55af2ffabf50eb4ae5',
            auth_token: token,
          }, data),
          timeout: 10000,
        });
      	request.done(function(data) {
          resolve(data);
      	});
      	request.fail( function(jqXHR, textStatus, errorThrown) {
          var message = "Error - " + textStatus + ": " + errorThrown;
          reject(new Error(message));
      	});
      })
      .catch(function(error) {
        reject(error);
      });
    });
    return promise;
  };
};
