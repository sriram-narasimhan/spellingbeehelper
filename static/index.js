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
    this.element = $("#words");
    this.view = $("#words").listview();
    this.setupClickHandlers();
  };
  this.setupClickHandlers = function() {
  };
  this.showWords = function() {
    var element = this.element;
    var view = this.view;
    if (this.currentList) {
      this.currentList.show(element, view);
    } else {
      element.empty();
      element.show();
      element.append("<li>select a wordlist first</li>");
      view.listview('refresh');
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
  this.error = null;
  this.show = function(element, view) {
    var self = this;
    element.empty();
    element.show();
    if(!self.words) {
      element.append("<li>The list of words has not been loaded.</li>");
      if (self.error) {
        element.append("<li>" + self.error.message + "</li>");
      }
    } else {
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
        //li += '<button class="ui-btn ui-btn-inline ui-btn-icon-left ui-icon-audio ui-corner-all"></button>';
        li += "</li>";
        element.append(li);
      });
    }
    view.listview('refresh');
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
      $("#words").hide();
      self.showWord(word);
    });
  };
  this.hasAudio = function(name) {
    var self = this;
    if (!(name in self.words)) return false;
    return self.words[name].hasAudio();
  };
  this.showWord = function(name) {
    var self = this;
    var element = self.element;
    if (!(name in self.words)) {
      element.empty().append("<h1>Word: " + name + " is not loaded");
      element.show();
      return;
    }
    element.empty().append(self.words[name].toHTML());
    element.show();
  };
  this.add = function(name) {
    console.log("adding " + name);
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
  this.wordnikAudio = [];
  this.definitions = [];
  this.hasAudio = function() {
    var self = this;
    return self.wordnikAudio && self.wordnikAudio.length > 0;
  };
  this.toHTML = function() {
    var self = this;
    var html = "";
    html += "<h1>";
    html += self.name;
    html += "</h1>";
    var audioData = self.wordnikAudio;
    if (!audioData || audioData.length < 1) {
      html += "<div>No audio found</div>";
    } else {
      $.each(audioData, function( index, value ) {
        html += '<audio controls preload="auto"><source src="' + value.fileUrl + '" type="audio/mpeg"></audio>';
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
    console.log("loading " + self.name);
    var promises = [];
    promises.push(self.loadWordnikAudio());
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
  this.loadWordnikAudio = function() {
    var self = this;
    var promise = new Promise(function(resolve, reject) {
      SPH.user.getURL("http://api.wordnik.com:80/v4/word.json/" + self.name + "/audio", {})
      .then(function(data) {
        self.wordnikAudio = data;
        resolve(data);
      })
      .catch(function(error) {
        resolve(error);
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
    this.word = {};
    this.words = null;
    this.wordListName = "";
    this.selectedPermalink = "";
    this.wordView = $("#words").listview();
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
      console.log("got wordlists");
      SPH.wordLists.show();
    })
    .catch(function(error){
      console.log("failed got wordlists");
      SPH.wordLists.show();
    });
  };
  this.showPractice = function() {
    $("#practice").show();
  };
  this.showWords = function() {
    var self = this;
    var list = $("#words");
    list.empty();
    list.show();
    if (!self.words) {
      list.append("<li>No words found. Load a wordlist first</li>");
    } else {
      $.each(self.words, function( index, value ) {
        var word = value.word;
        var theme = "c";
        if (word in self.word) {
          if (self.word[word].state == "loaded") {
            if ('wordnikAudio' in self.word[word] && self.word[word]['wordnikAudio'].length > 0) {
              theme = "a";
            } else {
              theme = "b";
            }
          }
        }
        var li = "<li data-theme='" + theme + "' data-word='" + word + "' data-type='word'>";
        li += word;
        li += "</li>";
        list.append(li);
      });
    }
    self.wordView.listview('refresh');
  };
  this.showWord = function(word) {
    var self = this;
    var audioData = self.word[word].wordnikAudio;
    $("#words").hide();
    var wordDiv = $("#word");
    wordDiv.empty();
    wordDiv.show();
    wordDiv.append("<h1>" + word + "</h1>");
    if (!audioData || audioData.length < 1) {
      wordDiv.append("<div>No audio found</div>");
    } else {
      $.each(audioData, function( index, value ) {
        wordDiv.append('<audio controls preload="auto"><source src="' + value.fileUrl + '" type="audio/mpeg"></audio>');
      });
    }
    SPH.loadingDialog.hide();
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
          console.log("show words");
          SPH.wordListManager.showWords();
          // self.showWords();
          break;
        case "practice":
          self.showPractice();
          break;
      };
    });
  };
  this.loadWordsInBackground = function(data) {
    var self = this;
    $.each(data, function( index, value ) {
      var word = value.word;
      var url = "http://api.wordnik.com:80/v4/word.json/" + word + "/audio";
      console.log("getting " + word);
      var token = SPH.user.getRequest(url, {});
      self.word[word] = {
        state: "loading",
      };
      token.done(function(data) {
        console.log("getting " + word + " succeeded");
        self.word[word].state = "loaded";
        self.word[word].wordnikAudio = data;
    	});
    	token.fail( function(message) {
        console.log("getting " + word + " failed");
        self.word[word].state = "failed";
        console.log("Failure getting " + word + ": " + message);
    	});
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
        console.log("got auth token");
        self.authToken = data;
        resolve(data.token);
    	});
    	request.fail( function(jqXHR, textStatus, errorThrown) {
        var message = "Error - " + textStatus + ": " + errorThrown;
        console.log("get auth token failed " + message);
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
          console.log("got data from " + url);
          resolve(data);
      	});
      	request.fail( function(jqXHR, textStatus, errorThrown) {
          var message = "Error - " + textStatus + ": " + errorThrown;
          console.log("get url failed " + message);
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
