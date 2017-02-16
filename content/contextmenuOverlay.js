/*
    Password Tags, extension for Firefox and others
    Copyright (C) 2017  Daniel Dawson <danielcdawson@gmail.com>

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

"use strict";

window.messageManager.loadFrameScript(
  "chrome://passwordtags/content/frame-script.js", true);

addEventListener(
  "load",
  function _loadHandler () {
    removeEventListener("load", _loadHandler, false);

    const Cc = Components.classes, Ci = Components.interfaces,
          Cu = Components.utils;

    var loginMgr =
      Cc["@mozilla.org/login-manager;1"].getService(Ci.nsILoginManager);
    var prefs =
      Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService).
        getBranch("extensions.passwordtags.");
    var strings =
      Cc["@mozilla.org/intl/stringbundle;1"].
      getService(Ci.nsIStringBundleService).createBundle(
        "chrome://passwordtags/locale/contextmenuOverlay.properties");

    var signonMetadataStorage;
    {
      let scopeObj = {};
      Cu.import("resource://passwordtags/signonMetadataStorage.jsm", scopeObj);
      signonMetadataStorage = scopeObj.signonMetadataStorage;
    }

    var curInfo, matches;
    var popup = document.getElementById("passwordtags-fillbytags-popup");

    function handleCommand (aEvt) {
      var target = aEvt.target;
      if (target.tagName != "menuitem") return;
      var idx = target.value;
      var mm = gBrowser.selectedBrowser.messageManager;
      mm.sendAsyncMessage(
        "PasswordTags:fillFormData",
        { username: matches[idx].username, password: matches[idx].password });
    }

    var contextshowingHandler = {
      receiveMessage({ data }) {
        curInfo = data;
        document.getElementById("passwordtags-fillbytags").hidden =
          !prefs.getBoolPref("allowPwdFillByTags") || !curInfo;
        while (popup.hasChildNodes()) popup.removeChild(popup.firstChild);
        matches =
          loginMgr.findLogins({}, curInfo.hostname, curInfo.formSubmitURL,
                              null);

        if (matches.length > 0) {
          for (let i = 0; i < matches.length; i++) {
            let tags = signonMetadataStorage.getTags(matches[i]);
            let item = document.createElement("menuitem");
            item.setAttribute("value", i);
            item.setAttribute("label", matches[i].username
                                       + (tags ? " (" + tags + ")" : ""));
	    item.addEventListener("command", handleCommand, false);
            popup.appendChild(item);
          }
        } else {
          let item = document.createElement("menuitem");
          item.setAttribute("label",
                            strings.GetStringFromName("nologins.label"));
          item.setAttribute("disabled", "true");
          popup.appendChild(item);
        }
      },
    };

    window.messageManager.addMessageListener(
      "PasswordTags:contextshowing", contextshowingHandler);
  },
  false);
