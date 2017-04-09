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

document.addEventListener(
  "DOMContentLoaded",
  function dclHandler (ev) {
    Components.utils.import(
      "resource://passwordtags/signonMetadataStorage.jsm", passwordTags);

    var tree = document.getElementById("signonsTree");
    passwordTags.signonsTree = tree;
    tree.addEventListener("select", passwordTags.updateTagsBox, false);

    var origHandleSignonKeyPress = window.HandleSignonKeyPress;
    window.HandleSignonKeyPress = function (evt) {
      if (evt.charCode ==
                 document.getElementById("pwdtagsStrbundle").
                   getString("editmetadataAccesskey").charCodeAt(0)
               && tree.view.selection.count <= 1 && !evt.altKey
	       && !evt.ctrlKey && !evt.metaKey && tree.editingRow == -1)
        passwordTags.editMetadata();
      else if (tree.editingRow == -1)
        return origHandleSignonKeyPress(evt);

      return true;
    }

    function cloneLoginInfo (loginInfo) {
      loginInfo.QueryInterface(Components.interfaces.nsILoginMetaInfo);
      var obj = {
        QueryInterface: passwordTags.XPCOMUtils.generateQI(
          [Components.interfaces.nsILoginInfo,
           Components.interfaces.nsILoginMetaInfo]),
        cloned: true,
      };
      for (let name of ["hostname", "httpRealm", "formSubmitURL", "username",
                        "password", "usernameField", "passwordField", "guid",
                        "timeCreated", "timeLastUsed", "timePasswordChanged",
                        "timesUsed"])
        obj[name] = loginInfo[name];
      return obj;
    }

    document.getElementById("signonsTreeContextMenu").addEventListener(
      "popupshowing",
      function () {
        const ids = ["menu_editMetadata", "menu_deleteMetadata"];
        var signon = passwordTags.getSelectedOrFocusedSignon();

        if (signon) {
          for (let id of ids)
            document.getElementById(id).removeAttribute("disabled");
        } else {
          for (let id of ids)
            document.getElementById(id).setAttribute("disabled", "true");
        }
      },
      false);

    document.removeEventListener("DOMContentLoaded", dclHandler, false);
  },
  false);

var passwordTags = {
  signonsTree: null,
  editingSignon: null,

  getFilterSet: function () {
    if (window.signons) {
      let treeView = this.signonsTree.view;
      return treeView._filterSet.length ? treeView._filterSet : signons;
    } else {
      let filterField = document.getElementById("filter");
      return _filterPasswords(filterField.value);
    }
  },

  getSelectedSignon: function () {
    var selection = this.signonsTree.view.selection;
    if (selection.count != 1) return null;
    let start = new Object(), end = new Object();
    selection.getRangeAt(0, start, end);
    return this.getFilterSet()[start.value];
  },

  getSelectedOrFocusedSignon: function () {
    var signon = this.getSelectedSignon();
    if (signon) return signon;
    if (this.signonsTree.view.selection.count == 0) {
      let idx = this.signonsTree.currentIndex;
      return this.getFilterSet()[idx];
    }
    return null;
  },

  updateTagsBox: function () {
    var signon = passwordTags.getSelectedSignon();
    var editbox = document.getElementById("tagsEdit");

    if (!signon) {
      editbox.value = "";
      editbox.disabled = "true";
      passwordTags.editingSignon = null;
    } else {
      let tags = passwordTags.signonMetadataStorage.getTags(signon);
      editbox.removeAttribute("disabled");
      editbox.value = tags;
      passwordTags.editingSignon = signon;
    }
  },

  setTags: function () {
    if (!this.editingSignon) return;
    this.signonMetadataStorage.setTags(
      this.editingSignon, document.getElementById("tagsEdit").value);
  },

  editMetadata: function () {
    var signon = this.getSelectedOrFocusedSignon();
    if (!signon) return;

    window.openDialog(
      "chrome://passwordtags/content/metadataEditor.xul", "",
      "centerscreen,dependent,dialog,chrome,modal,resizable",
      signon, null);
    //LoadSignons();
  },

  deleteMetadata: function () {
    const Cc = Components.classes, Ci = Components.interfaces;
    var prefBranch = Cc["@mozilla.org/preferences-service;1"].
                     getService(Ci.nsIPrefService).
                     getBranch("extensions.passwordtags.");
    if (prefBranch.getBoolPref("promptForDeleteMetadata")) {
      let strings = document.getElementById("pwdtagsStrbundle");
      let promptSvc =
        Cc["@mozilla.org/embedcomp/prompt-service;1"].
        getService(Ci.nsIPromptService);
      let res = promptSvc.confirmEx(
        window,
        strings.getString("confirmDeleteMetadata.title"),
        strings.getString("confirmDeleteMetadata.msg"),
        promptSvc.STD_YES_NO_BUTTONS
          + promptSvc.BUTTON_POS_2*promptSvc.BUTTON_TITLE_IS_STRING
          + promptSvc.BUTTON_DELAY_ENABLE,
        null, null, strings.getString("confirmDeleteMetadata_always.label"),
        null, {});
      if (res == 1)
        return;
      else if (res == 2)
        prefBranch.setBoolPref("promptForDeleteMetadata", false);
    }

    var signon = this.getSelectedOrFocusedSignon();
    if (!signon) return;

    this.signonMetadataStorage.removeMetadata(signon);
    //LoadSignons();
  },
};

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm", passwordTags);
