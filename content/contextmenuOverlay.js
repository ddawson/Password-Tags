/*
    Password Tags, extension for Firefox 3.6+ and others
    Copyright (C) 2012  Daniel Dawson <ddawson@icehouse.net>

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

    function shouldShowSubmenu (aElement) {
      if (aElement instanceof Ci.nsIDOMHTMLInputElement && aElement.form)
        var form = aElement.form;
      else
        return false;

      var curDoc = aElement.ownerDocument;
      var curLocation = curDoc.defaultView.location;
      var hostname = curLocation.protocol + "//" + curLocation.host;
      var passwordField = null;
      for (var i = 0; i < form.elements.length; i++) {
        let element = form.elements[i];
        if (element instanceof Ci.nsIDOMHTMLInputElement
            && element.type == "password") {
          passwordField = element;
          break;
        }
      }
      if (!passwordField) return false;

      var usernameField = null;
      for (i = i - 1; i >= 0; i--) {
        let element = form.elements[i];
        if (!element instanceof Ci.nsIDOMHTMLInputElement) continue;
        let elType = element.getAttribute("type");
        if (!elType || elType == "text" || elType == "email" || elType == "url"
            || elType == "tel" || elType == "number") {
          usernameField = element;
          break;
        }
      }
      if (!usernameField) return false;

      var formAction = form.action;
      var res =
        formAction ? /^([0-9-_A-Za-z]+:\/\/[^/]+)\//.exec(formAction)[1]
                   : hostname;

      curInfo = {
        hostname: hostname,
        formSubmitURL: res,
        usernameField: usernameField,
        passwordField: passwordField,
      };
      return true;
    }

    document.getElementById("contentAreaContextMenu").addEventListener(
      "popupshowing",
      function () {
        document.getElementById("passwordtags-fillbytags").hidden =
          !prefs.getBoolPref("allowPwdFillByTags")
          || !shouldShowSubmenu(gContextMenu.target);
      },
      false);

    var popup = document.getElementById("passwordtags-fillbytags-popup");
    popup.addEventListener(
      "popupshowing",
      function () {
        while (popup.hasChildNodes()) popup.removeChild(popup.firstChild);
        matches =
          loginMgr.findLogins({}, curInfo.hostname, curInfo.formSubmitURL,
                              null);
        if (matches.length > 0)
          for (let i = 0; i < matches.length; i++) {
            let tags = signonMetadataStorage.getTags(matches[i]);
            let item = document.createElement("menuitem");
            item.setAttribute("value", i);
            item.setAttribute("label", matches[i].username
                                       + (tags ? " (" + tags + ")" : ""));
            popup.appendChild(item);
          }
        else {
          let item = document.createElement("menuitem");
          item.setAttribute("label",
                            strings.GetStringFromName("nologins.label"));
          item.setAttribute("disabled", "true");
          popup.appendChild(item);
        }
      },
      false);

    popup.addEventListener(
      "command",
      function (aEvt) {
        var target = aEvt.target;
        if (target.tagName != "menuitem") return;
        var idx = target.value;
        curInfo.usernameField.value = matches[idx].username;
        curInfo.passwordField.value = matches[idx].password;
        matches = null;
      },
      false);
  },
  false);
