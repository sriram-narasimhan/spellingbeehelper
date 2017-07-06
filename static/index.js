/*
 * License Text.
 * Authors: Sriram Narasimhan
 */

/** Define a SpellingBeeHelper namespace */
SPH = {};

// wordLists manage the list of wordlists.
SPH.wordLists = new function() {
  this.wordListsData = null;
  this.error = null;
  this.init = function() {
    this.element = $("#wordlists");
    this.view = $("#wordlists").listview();
    this.setupClickHandlers();
  };
  this.setupClickHandlers = function() {
    $(document).on("tap", "[data-type='wordlist']", function(e) {
      var permalink = $(this).data("permalink");
      var name = $(this).data("name");
      alert(permalink + name);
      // SPH.loadingDialog.show("Loading " + name);
      // var url = "http://api.wordnik.com:80/v4/wordList.json/" + permalink + "/words";
      // var data = {
      //   skip: 0,
      //   limit: 1000,
      // };
      // var token = SPH.user.getRequest(url, data);
      // token.done(function(data) {
      //   self.words = data;
      //   self.wordListName = name;
      //   self.selectedPermalink = permalink;
      //   self.loadWordsInBackground(data);
      //   var attributeName = "theme";
      //   $('[data-permalink]').data(attributeName, "a").attr("data-" + attributeName, "a").removeClass("ui-body-b").addClass("ui-body-a");
      //   $('[data-permalink="' + permalink + '"]').data(attributeName, "b").attr("data-" + attributeName, "b").trigger('refresh').removeClass("ui-body-a").addClass("ui-body-b");
      //   SPH.loadingDialog.hide();
      //   //SPH.messageDialog.show("successfully loaded " + data.length + " words from " + name);
    	// });
    	// token.fail( function(message) {
      //   SPH.messageDialog.show(message);
    	// });
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
      console.log("showing");
      $.each(self.wordListsData, function( index, value ) {
        console.log(value);
        var theme = value.permalink == self.selectedPermalink ? "b" : "a";
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
    this.setupClickHandlers();
    $("[data-type='content']").hide();
    SPH.wordLists.load()
    .then(function(data) {
      console.log("got wordlists");
      SPH.wordLists.show();
    })
    .catch(function(error){
      console.log("failed got wordlists");
      SPH.wordLists.show();
    });
    //this.loadWordLists();
  };
  this.loadWordLists = function() {
    SPH.loadingDialog.show("Loading word list names");
    var self = this;
    var list = $("#wordlists");
    var url = "http://api.wordnik.com/v4/account.json/wordLists";
    SPH.user.getURL(url)
    .then(function(data) {
      list.empty();
      list.show();
      $.each(data, function( index, value ) {
        var theme = value.permalink == self.selectedPermalink ? "b" : "a";
        var li = "<li data-theme='" + theme + "' data-name='" + value.name + "' data-type='wordlist' data-permalink='" + value.permalink + "'>";
        li += value.name;
        li += ' <span class="ui-li-count">';
        li += value.numberWordsInList;
        li += "</span></li>";
        list.append(li);
      });
      self.listView.listview('refresh');
      SPH.loadingDialog.hide();
    })
    .catch(function(error) {
      SPH.loadingDialog.hide();
      SPH.messageDialog.show(error.message);
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
          self.showWords();
          break;
        case "practice":
          self.showPractice();
          break;
      };
    });
    $(document).on("tap", "[data-type='word']", function(e) {
      var word = $(this).data("word");
      SPH.loadingDialog.show("Loading " + word);
      if (word in self.word) {
        if (self.word[word].state == "loaded") {
          self.showWord(word);
          return
        }
        if (self.word[word].state == "loading") return;
      }
      var url = "http://api.wordnik.com:80/v4/word.json/" + word + "/audio";
      var token = SPH.user.getRequest(url, {});
      self.word[word] = {
        state: "loading",
      };
      token.done(function(data) {
        self.word[word].state = "loaded";
        self.word[word].wordnikAudio = data;
        self.showWord(word);
    	});
    	token.fail( function(message) {
        self.word[word].state = "failed";
        SPH.loadingDialog.hide();
        SPH.messageDialog.show(message);
    	});
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

/**
 * SPH.word represents a single word.
 */
SPH.word = new function(name) {
  this.name = name;
  this.promises = [];
  this.load = function() {

  };
  this.loadWordnikAudio = function() {
    var self = this;
    var url = "http://api.wordnik.com:80/v4/word.json/" + self.name + "/audio";
    var token = SPH.user.getRequest(url, {});
    token.done(function(data) {
      this.wordnikAudio = data;
    });
    token.fail( function(message) {
      this.wordnikAudio = null;
    });
  };
};

SPH.user = new function() {
  this.apiKey = "a2a73e7b926c924fad7001ca3111acd55af2ffabf50eb4ae5";
  this.authToken = null;
  this.getAuthToken = function() {
    var self = this;
    var promise = new Promise(function(resolve, reject) {
      if (self.authToken) return resolve(self.authToken);
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
        reject(Error(message));
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
          reject(Error(message));
      	});
      })
      .catch(function(error) {
        reject(error);
      });
    });
    return promise;
  };
};
