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

    /*
    var cols = document.getElementById("signonsTree").firstChild;
    var ord = parseInt(cols.lastChild.ordinal) + 1;
    for (let id of ["tagsColSplitter", "tagsCol",
                    "metadataColSplitter", "metadataCol"]) {
      let el = document.getElementById(id);
      el.ordinal = ord++;
      cols.appendChild(el);
    }
    */

    passwordTags.signonsTree = document.getElementById("signonsTree");

    // Formerly replacing functions to "wedge" in our functionality.
    // But this no longer works, so I'm commenting these out until I can
    // figure out something else I can do.
    /*
    var signonsTreeView = passwordTags.signonsTree.view;
    var origGetCellText = signonsTreeView.getCellText;
    signonsTreeView.getCellText = function (row, column) {
      var filterSet = passwordTags.getFilterSet();
      var signon = filterSet.length ? filterSet[row] : signons[row];

      switch (column.id) {
      case "tagsCol":
        return passwordTags.signonMetadataStorage.getTags(signon);
        break;

      case "metadataCol":
        let mdRawObj =
          passwordTags.signonMetadataStorage.getMetadataRaw(signon);
        let mdRawStr = mdRawObj ? mdRawObj.metadata : "";
        let strings = document.getElementById("pwdtagsStrbundle");
        return (!mdRawStr) ? "" :
          mdRawStr.substr(0, 2) == "0|" ?
            strings.getString("unencrypted.celltext")
          : mdRawStr.substr(0, 2) == "1|" ?
            strings.getString("encrypted.celltext")
          : strings.getString("unencrypted.celltext");
        break;
      }

      return origGetCellText.call(this, row, column);
    }

    var origIsEditable = signonsTreeView.isEditable;
    if (!origIsEditable) origIsEditable = () => false;
    signonsTreeView.isEditable = function (row, col) {
      return col.id == "tagsCol" ? true : origIsEditable.call(this, row, col);
    }

    var origSetCellText = signonsTreeView.setCellText;
    if (!origSetCellText) origSetCellText = function () {};
    signonsTreeView.setCellText = function (row, col, value) {
      if (col.id == "tagsCol") {
        let filterSet = passwordTags.getFilterSet();
        let signon = filterSet.length ? filterSet[row] : signons[row];
        passwordTags.signonMetadataStorage.setTags(signon, value);
        _filterPasswords();
      }
      origSetCellText.call(this, row, col, value);
    }
    */

    var origHandleSignonKeyPress = window.HandleSignonKeyPress;
    window.HandleSignonKeyPress = function (evt) {
      let tree = document.getElementById("signonsTree");
      if (evt.charCode ==
            document.getElementById("pwdtagsStrbundle").
              getString("edittagsAccesskey").charCodeAt(0) &&
          !evt.altKey && !evt.ctrlKey && !evt.metaKey && tree.editingRow == -1)
        //passwordTags.editTags();
        ;
      else if (evt.charCode ==
                 document.getElementById("pwdtagsStrbundle").
                   getString("editmetadataAccesskey").charCodeAt(0) &&
               !evt.altKey && !evt.ctrlKey && !evt.metaKey &&
               tree.editingRow == -1)
        passwordTags.editMetadata();
      else if (tree.editingRow == -1)
        return origHandleSignonKeyPress(evt);

      return true;
    }

    /*
    var origGetColumnByName = window.getColumnByName;
    if (!origGetColumnByName) origGetColumnByName = () => null;
    window.getColumnByName = (column) =>
      column == "tags" ? document.getElementById("tagsCol") :
      column == "metadataType" ? document.getElementById("metadataCol") :
                                 origGetColumnByName(column);
    */

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

    /*
    var origSignonColumnSort = window.SignonColumnSort;
    if (!origSignonColumnSort) origSignonColumnSort = function () {};
    window.SignonColumnSort = function (column) {
      var signonsTreeView = passwordTags.signonsTree.view;
      var fs = passwordTags.getFilterSet();
      var l = fs.length;
      if (!l) {
        l = signons.length;
        for (let i = 0; i < l; i++) {
          let tags =
            signonsTreeView.getCellText(i, {id:"tags"});
          let metadataType =
            signonsTreeView.getCellText(i, {id:"metadataType"});
          if (!signons[i].cloned) signons[i] = cloneLoginInfo(signons[i]);
          signons[i].tags = tags;
          signons[i].metadataType = metadataType;
        }
      } else {
        for (let i = 0; i < l; i++) {
          let tags =
            signonsTreeView.getCellText(i, {id:"tags"});
          let metadataType =
            signonsTreeView.getCellText(i, {id:"metadataType"});
          if (!fs[i].cloned) fs[i] = cloneLoginInfo(fs[i]);
          fs[i].tags = tags;
          fs[i].metadataType = metadataType;
        }
      }
      origSignonColumnSort(column);
    }

    var origSignonMatchesFilter = window.SignonMatchesFilter;
    if (!origSignonMatchesFilter) origSignonMatchesFilter = () => false;
    window.SignonMatchesFilter = function (signon, filterValue) {
      if (origSignonMatchesFilter(signon, filterValue)) return true;
      if (signon.tags &&
          signon.tags.toLowerCase().indexOf(filterValue) != -1)
        return true;
      if (signon.metadataType &&
          signon.metadataType.toLowerCase().indexOf(filterValue) != -1)
        return true;
      return false;
    }

    var origSortTree = window.SortTree;
    window.SortTree = function (aColumn, aAscending) {
      var filterSet = passwordTags.getFilterSet();
      var table = filterSet.length ? filterSet : signons;
      var selections = GetTreeSelections();
      var selectedNumber =
        selections.length ? table[selections[0]].number : -1;
      if (aColumn == "tags") {
        let compareFunc = function (first, second) {
          let firstTags = first[aColumn].split(","),
              secondTags = second[aColumn].split(",");
          let i = 0;
          while (true) {
            let t1 = firstTags[i], t2 = secondTags[i];
            if (t2 && !t1) return -1;
            if (t1 && !t2) return 1;
            if (!t1 && !t2) return 0;
            let t1l = t1.toLowerCase(), t2l = t2.toLowerCase();
            let comp = t1l < t2l ? -1 : t1l > t2l ? 1 : 0;
            if (comp != 0) return comp;
            i++;
          }
        };
        table.sort(ascending ? compareFunc :
                   (first, second) => -compareFunc(first, second));
      } else if (aColumn == "metadataType") {
        let compareFunc;

        if (ascending)
          compareFunc = (first, second) =>
            first[aColumn].localeCompare(second[aColumn]);
        else
          compareFunc = (first, second) =>
            second[aColumn].localeCompare(first[aColumn]);
        table.sort(compareFunc);
      } else
        return origSortTree(aColumn, aAscending);

      var selectedRow = -1;
      if (selectedNumber>=0 && updateSelection) {
        for (var s=0; s<table.length; s++) {
          if (table[s].number == selectedNumber) {
            tree.view.selection.select(-1);
            tree.view.selection.select(s);
            selectedRow = s;
            break;
          }
        }
      }

      tree.treeBoxObject.invalidate();
      if (selectedRow >= 0)
        tree.treeBoxObject.ensureRowIsVisible(selectedRow);
    }
    */

    document.removeEventListener("DOMContentLoaded", dclHandler, false);
  },
  false);

var passwordTags = {
  signonsTree: null,

  getFilterSet: function () {
    if (window.signons) {
      let treeView = this.signonsTree.view;
      return treeView._filterSet.length ? treeView._filterSet : signons;
    } else {
      let filterField = document.getElementById("filter");
      return _filterPasswords(filterField.value);
    }
  },

  /*
  editTags: function () {
    var tree = document.getElementById("signonsTree");
    var idx = tree.currentIndex;
    var tagsColObj = tree.columns.getNamedColumn("tagsCol");
    tree.startEditing(idx, tagsColObj);
  },
  */

  editMetadata: function () {
    var tree = document.getElementById("signonsTree");
    var idx = tree.currentIndex;
    var signon = this.getFilterSet()[idx];
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

    var idx = this.signonsTree.currentIndex;
    var signon = this.getFilterSet()[idx];
    this.signonMetadataStorage.removeMetadata(signon);
    //LoadSignons();
  },
};

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm", passwordTags);
