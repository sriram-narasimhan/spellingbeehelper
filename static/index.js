/*
 * License Text.
 * Authors: Sriram Narasimhan
 */

/** Define a SpellingBeeHelper namespace */
SPH = {};

SPH.ajax = function(url) {
  var sitePrefix = "http://localhost:9999";
  var promise = new Promise(function(resolve, reject) {
    var request = $.ajax({
      method: "GET",
      url: sitePrefix + url,
      timeout: 10000,
    });
    request.done(function(data) {
      resolve(data);
    });
    request.fail( function(jqXHR, textStatus, errorThrown) {
      var message = "Error - " + textStatus + ": " + errorThrown;
      reject(new Error(message));
    });
  });
  return promise;
};

/**
 * The initialize function. Called only once when the app starts.
 */
SPH.app = new function() {
  this.wordLists = {};
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
    if ( self.isCordovaApp() ) {
    	$.when( cordovaReady, jQueryMobileReady ).then( self.init.bind(self) );
    }
    else {
      $.when( jQueryMobileReady ).then( self.init.bind(self) );
    }
  };
  this.init = function() {
    if ( navigator && navigator.splashscreen ) {
      navigator.splashscreen.hide();
    }
    this.initDialogs();
    SPH.wordLists.init();
    // SPH.wordListManager.init();
    // SPH.wordManager.init();
    this.setupClickHandlers();
    $("[data-type='content']").hide();
    SPH.wordLists.show();
  };
  this.initDialogs = function() {
    SPH.loadingDialog = new SPH.dialog("loading-popup", true);
    SPH.messageDialog = new SPH.dialog("message-popup", true);
  };
  this.setupClickHandlers = function() {
    var self = this;
    $(document).on("tap", "[data-type='navbar']", function(e) {
      var name = $(this).data("name");
      $("[data-type='content']").hide();
      switch(name) {
        case "load-wordlist":
          SPH.wordLists.show();
          break;
        case "show-words":
          SPH.wordLists.showWords();
          break;
        case "practice":
          SPH.wordLists.showPractice();
          break;
        case "learn":
          SPH.wordLists.showLearn();
          break;
      };
    });
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

SPH.wordList = function(name, numWords) {
  this.name = name;
  this.numWords = numWords;
  this.wordsLoaded = false;
  this.words = {};
  this.wordsArray = [];
  this.wordsWithAudioArray = [];
  this.currentWordIndex = 0;
  this.error = null;
  this.element = $("#words-container");
  this.listElement = $("#words-list-container");
  this.filter = $(":input[name= 'filter']").val();
  this.setFilter = function(value) {
    this.filter = value;
  };
  this.addWords = function (data) {
    var self = this;
    self.wordsLoaded = true;
    self.words = data;
    for (var name in self.words) {
      this.wordsArray.push(name);
      if (self.words[name].audio && self.words[name].audio.length > 0) {
        this.wordsWithAudioArray.push(name);
      }
    }
    self.error = null;
  };
  this.load = function() {
    var self = this;
    SPH.loadingDialog.show("loading words in wordlist " + self.name);
    var promise = new Promise(function(resolve, reject) {
      if (self.wordsLoaded) {
        SPH.loadingDialog.hide();
        return resolve(self.words);
      }
      SPH.ajax("/wordlist/get-words?name=" + self.name)
      .then(function(data) {
        self.addWords(data);
        SPH.loadingDialog.hide();
        resolve(self.words);
      })
      .catch(function(error) {
        self.wordsLoaded = false;
        self.error = error;
        SPH.loadingDialog.hide();
        reject(error);
      });
    });
    return promise;
  };
  this.showPractice = function() {
    var self = this;
    self.load()
    .then(function() {
      self.showPracticeInternal();
    })
    .catch(function() {
      self.showPracticeInternal();
    });
  };
  this.showPracticeInternal = function(element) {
    var self = this;
    var element = $("#practice");
    element.show();
    element.empty();
    if (self.wordsWithAudioArray.length > 0) {
      var min = 0;
      var max = self.wordsWithAudioArray.length - 1;
      var index = Math.floor(Math.random()*(max-min+1)+min);;
      var word = self.wordsWithAudioArray[index];
      var html = "";
      html += '<label for="basic">Enter word spelling:</label>';
      html += '<input type="text" name="name" id="answer" value="" data-mini="true" data-clear-btn="true">';
      html += '<button id="check-answer" class="ui-btn ui-btn-inline ui-mini ui-shadow ui-corner-all">Check</button>';
      html += '<button id="next-word" class="ui-btn ui-btn-inline ui-mini ui-shadow ui-corner-all">Next Word</button>';
      html += self.getPracticeWordHTML(self.words[word], true, false);
      element.append(html);
    } else {
      element.append("<h1>No words with audio found</h1>");
    }
  };
  this.setIndex = function(index) {
    var self = this;
    self.currentWordIndex = index;
  };
  this.incrementIndex = function() {
    var self = this;
    self.currentWordIndex++;
    if (self.currentWordIndex >= self.wordsArray.length) {
      self.currentWordIndex = 0;
    }
  };
  this.decrementIndex = function() {
    var self = this;
    self.currentWordIndex--;
    if (self.currentWordIndex < 0) {
      self.currentWordIndex = self.wordsArray.length-1;
    }
  };
  this.showLearn = function() {
    var self = this;
    self.load()
    .then(function() {
      self.showLearnInternal();
    })
    .catch(function() {
      self.showLearnInternal();
    });
  };
  this.showLearnInternal = function() {
    var self = this;
    var element = $("#learn");
    element.show();
    element.empty();
    if (self.wordsArray.length > 0) {
      var min = 0;
      var max = self.wordsWithAudioArray.length - 1;
      var index = Math.floor(Math.random()*(max-min+1)+min);;
      var word = self.wordsArray[self.currentWordIndex];
      var html = "";
      html += '<button id="previous-word" class="ui-btn ui-btn-inline ui-mini ui-shadow ui-corner-all">Previous Word</button>';
      html += '<button id="next-word" class="ui-btn ui-btn-inline ui-mini ui-shadow ui-corner-all">Next Word</button>';
      html += self.getPracticeWordHTML(self.words[word], false, true);
      element.append(html);
    } else {
      element.append("<h1>No words with audio found</h1>");
    }
  };
  this.getPracticeWordHTML = function(word, autoplay, showName) {
    var self = this;
    var html = "";
    var name = word.name;
    if (showName) {
      html += "<h1>";
      html += name;
      html += "</h1>";
    } else {
      html += "<div id='reveal-answer' data-word='" + name + "'></div>";
    }
    if (!word.audio || word.audio.length < 0) {
      html += "<div>No audio found</div>";
    }
    var autoplaySelected = false;
    // Assume mp3 audio for now
    $.each(word.audio, function( index, value ) {
      html += '<audio controls ';
      if (autoplay && !autoplaySelected) {
        html += "autoplay";
        autoplaySelected = true;
      }
      html += '><source src="' + value + '" type="audio/mpeg"></audio>';
    });
    var definitions = word.definitions;
    if (!definitions || definitions.length < 1) {
      html += "<div>No definitions found</div>";
    } else {
      html += "<h2>Definitions</h2>";
      $.each(definitions, function( index, value ) {
        html += "<div>" + value + "</div>";
      });
    }
    var pos = word.partsOfSpeech;
    if (!pos || pos.length < 1) {
      html += "<div>No parts of speech found</div>";
    } else {
      html += "<h2>Parts of Speech</h2>";
      $.each(pos, function( index, value ) {
        html += "<div>" + value + "</div>";
      });
    }
    return html;
  };
  this.show = function() {
    var self = this;
    self.load()
    .then(function() {
      self.showInternal();
    })
    .catch(function() {
      self.showInternal();
    });
  };
  this.showInternal = function() {
    var self = this;
    var element = self.element;
    var listElement = self.listElement;
    element.show();
    listElement.empty();
    var words = self.words;
    self.currentWordIndex = 0;
    if(!self.wordsLoaded) {
      listElement.append("<h1>Words are not loaded.</h1>");
      if (self.error) {
        listElement.append("<h2>" + self.error + "</h1>");
      }
    } else {
      var html = "";
      html += '<ul id="words" data-type="content" data-role="listview" data-inset="true">';
      $.each(self.wordsArray, function( index, name ) {
        var word = words[name];
        var li = "<li ";
        if (word.audio && word.audio.length > 0) {
          li += "data-icon='audio'";
        } else {
          li += "data-icon='false'";
        }
        li += " data-word='" + name + "' data-index=" + index + " data-type='word'>";
        li += '<a href="#" data-theme="b">';
        li += name;
        li += "</a>"
        li += "</li>";
        html += li;
      });
      html += "</ul>";
      listElement.append(html);
      $("#words").listview().listview('refresh');
    }
    if (self.filter == "all") {
      $("li[data-icon]").show();
    } else {
      $("li[data-icon]").hide();
      $("li[data-icon='audio']").show();
    }
  };
};

// wordLists manage the list of wordlists.
SPH.wordLists = new function() {
  this.numWordLists = 0;
  this.wordLists = {};
  this.words = {};
  this.currentList = null;
  this.error = null;
  this.init = function() {
    this.element = $("#wordlists");
    this.view = $("#wordlists").listview();
    this.setupClickHandlers();
  };
  this.setupClickHandlers = function() {
    var self = this;
    $(document).on("tap", "[data-type='wordlist']", function(e) {
      var name = $(this).data("name");
      self.currentList = name;
      SPH.wordLists.show();
    });
    $(":input[name= 'filter']").on('change', function(){
      var clicked = $(this).val();
      self.wordLists[self.currentList].setFilter(clicked);
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
    $(document).on("tap", "#practice > #next-word", function(e) {
      self.showPractice();
    });
    $(document).on("swipeleft", "#practice", function() {
      self.showPractice();
    });
    $(document).on("swiperight", "#practice", function() {
      self.showPractice();
    });
    $(document).on("tap", "#learn > #next-word", function(e) {
      self.wordLists[self.currentList].incrementIndex();
      self.showLearn();
    });
    $(document).on("tap", "#learn > #previous-word", function(e) {
      self.wordLists[self.currentList].decrementIndex();
      self.showLearn();
    });
    $(document).on("swipeleft", "#learn", function() {
      self.wordLists[self.currentList].decrementIndex();
      self.showLearn();
    });
    $(document).on("swiperight", "#learn", function() {
      self.wordLists[self.currentList].incrementIndex();
      self.showLearn();
    });
    $(document).on("tap", "[data-type='word']", function(e) {
      var index = $(this).data("index");
      self.wordLists[self.currentList].setIndex(index);
      $('[data-name="learn"]').trigger("click");
      $('[data-name="learn"]').trigger("tap");
    });
  };

  this.checkAnswer = function() {
    var input = $("#answer");
    var answer = input.val().toLowerCase();
    var actual = $("#reveal-answer").data("word").toLowerCase();
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
  this.showWords = function() {
    var self = this;
    if (!self.currentList) {
      SPH.messageDialog.show("Select a word list first");
      return false;
    } else {
      self.wordLists[self.currentList].show();
    }
  };
  this.showPractice = function() {
    var self = this;
    if (!self.currentList) {
      SPH.messageDialog.show("Select a word list first");
      return false;
    } else {
      self.wordLists[self.currentList].showPractice();
    }
  };
  this.showLearn = function() {
    var self = this;
    if (!self.currentList) {
      SPH.messageDialog.show("Select a word list first");
      return false;
    } else {
      self.wordLists[self.currentList].showLearn();
    }
  };
  this.show = function() {
    var self = this;
    self.load()
    .then(function(data) {
      self.showInternal();
    })
    .catch(function(error){
      self.showInternal();
    });
  };
  this.showInternal = function() {
    var self = this;
    var element = self.element
    element.empty();
    element.show();
    if(self.numWordLists == 0) {
      element.append("<li>The list of wordlists has not been loaded.</li>");
      if (self.error) {
        element.append("<li>" + self.error.message + "</li>");
      }
    } else {
      for (var name in self.wordLists) {
        var value = self.wordLists[name];
        var theme = "a";
        if (self.currentList == name) {
          theme = "b";
        }
        var li = "<li data-theme='" + theme + "' data-name='" + value.name + "' data-type='wordlist'>";
        li += value.name;
        li += ' <span class="ui-li-count">';
        li += value.numWords;
        li += "</span></li>";
        element.append(li);
      }
    }
    self.view.listview('refresh');
  };
  this.load = function() {
    var self = this;
    SPH.loadingDialog.show("loading wordlists");
    var promise = new Promise(function(resolve, reject) {
      if (self.numWordLists > 0) {
        SPH.loadingDialog.hide();
        return resolve(self.wordLists);
      }
      SPH.ajax("/wordlist/get-lists")
      .then(function(data) {
        self.numWordLists = 0;
        for (var name in data.lists) {
          var list = data.lists[name];
          self.numWordLists++;
          self.wordLists[name] = new SPH.wordList(list["name"], list["numWords"]);
        }
        SPH.loadingDialog.hide();
        resolve(self.wordLists);
      })
      .catch(function(error) {
        self.numWordLists = 0;
        self.wordLists = {};
        self.error = error;
        SPH.loadingDialog.hide();
        reject(error);
      });
    });
    return promise;
  };
};

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
