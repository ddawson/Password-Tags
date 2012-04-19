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

document.addEventListener(
  "DOMContentLoaded",
  function dclHandler (ev) {
    Components.utils.import(
      "resource://passwordtags/signonMetadataStorage.jsm", passwordTags);

    var cols = document.getElementById("signonsTree").firstChild;
    var ord = parseInt(cols.lastChild.ordinal) + 1;
    for each (let id in ["tagsColSplitter", "tagsCol",
                         "metadataColSplitter", "metadataCol"]) {
      let el = document.getElementById(id);
      el.ordinal = ord++;
      cols.appendChild(el);
    }

    // Replacing functions to "wedge" in our functionality
    // Is there a better way to accomplish this?
    var origGetCellText = signonsTreeView.getCellText;
    function ptagsGetCellText (row, column) {
      var signon = this._filterSet.length ?
                   this._filterSet[row] : signons[row];
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

      default:
        return origGetCellText.call(this, row, column);
        break;
      }
    }
    signonsTreeView.getCellText = ptagsGetCellText;

    var origIsEditable = signonsTreeView.isEditable;
    if (!origIsEditable) origIsEditable = function () false;
    function ptagsIsEditable (row, col)
      col.id == "tagsCol" ? true : origIsEditable.call(this, row, col);
    signonsTreeView.isEditable = ptagsIsEditable;

    var origSetCellText = signonsTreeView.setCellText;
    if (!origSetCellText) origSetCellText = function () {};
    function ptagsSetCellText (row, col, value) {
      if (col.id == "tagsCol") {
        let signon = this._filterSet.length ?
                     this._filterSet[row] : signons[row];
        passwordTags.signonMetadataStorage.setTags(signon, value);
        _filterPasswords();
      }
      origSetCellText.call(this, row, col, value);
    }
    signonsTreeView.setCellText = ptagsSetCellText;

    var origHandleSignonKeyPress = window.HandleSignonKeyPress;
    function ptagsHandleSignonKeyPress (evt) {
      let tree = document.getElementById("signonsTree");
      if (evt.charCode ==
            document.getElementById("pwdtagsStrbundle").
              getString("edittagsAccesskey").charCodeAt(0) &&
          !evt.altKey && !evt.ctrlKey && !evt.metaKey && tree.editingRow == -1)
        passwordTags.editTags();
      else if (evt.charCode ==
                 document.getElementById("pwdtagsStrbundle").
                   getString("editmetadataAccesskey").charCodeAt(0) &&
               !evt.altKey && !evt.ctrlKey && !evt.metaKey &&
               tree.editingRow == -1)
        passwordTags.editMetadata();
      else if (tree.editingRow == -1)
        return origHandleSignonKeyPress(evt);
    }
    HandleSignonKeyPress = ptagsHandleSignonKeyPress;

    var origGetColumnByName = window.getColumnByName;
    if (!origGetColumnByName) origGetColumnByName = function () null;
    function ptagsGetColumnByName (column)
      column == "tags" ? document.getElementById("tagsCol") :
      column == "metadataType" ? document.getElementById("metadataCol") :
                                 origGetColumnByName(column);
    getColumnByName = ptagsGetColumnByName;

    function cloneLoginInfo (loginInfo) {
      loginInfo.QueryInterface(Components.interfaces.nsILoginMetaInfo);
      var obj = {
        QueryInterface: passwordTags.XPCOMUtils.generateQI(
          [Components.interfaces.nsILoginInfo,
           Components.interfaces.nsILoginMetaInfo]),
        cloned: true,
      };
      for each (let name in ["hostname", "httpRealm", "formSubmitURL",
                             "username", "password", "usernameField",
                             "passwordField", "guid", "timeCreated",
                             "timeLastUsed", "timePasswordChanged",
                             "timesUsed"])
        obj[name] = loginInfo[name];
      return obj;
    }

    var origSignonColumnSort = window.SignonColumnSort;
    if (!origSignonColumnSort) origSignonColumnSort = function () {};
    function ptagsSignonColumnSort (column) {
      var l = signonsTreeView._filterSet.length;
      if (!l) {
        l = signons.length;
        for (let i = 0; i < l; i++) {
          let tags =
            signonsTreeView.getCellText(i, getColumnByName("tags"));
          let metadataType =
            signonsTreeView.getCellText(i, getColumnByName("metadataType"));
          if (!signons[i].cloned) signons[i] = cloneLoginInfo(signons[i]);
          signons[i].tags = tags;
          signons[i].metadataType = metadataType;
        }
      } else {
        let fs = signonsTreeView._filterSet;
        for (let i = 0; i < l; i++) {
          let tags =
            signonsTreeView.getCellText(i, getColumnByName("tags"));
          let metadataType =
            signonsTreeView.getCellText(i, getColumnByName("metadataType"));
          if (!fs[i].cloned) fs[i] = cloneLoginInfo(fs[i]);
          fs[i].tags = tags;
          fs[i].metadataType = metadataType;
        }
      }
      origSignonColumnSort(column);
    }
    SignonColumnSort = ptagsSignonColumnSort;

    var origSignonMatchesFilter = window.SignonMatchesFilter;
    if (!origSignonMatchesFilter) origSignonMatchesFilter = function () false;
    function ptagsSignonMatchesFilter (signon, filterValue) {
      if (origSignonMatchesFilter(signon, filterValue)) return true;
      if (signon.tags &&
          signon.tags.toLowerCase().indexOf(filterValue) != -1)
        return true;
      if (signon.metadataType &&
          signon.metadataType.toLowerCase().indexOf(filterValue) != -1)
        return true;
      return false;
    }
    SignonMatchesFilter = ptagsSignonMatchesFilter;

    var origSortTree = window.SortTree;
    function ptagsSortTree (tree, view, table, column, lastSortColumn,
                            lastSortAscending, updateSelection) {
      var ascending = (column == lastSortColumn) ? !lastSortAscending : true;
      if (column == "tags") {
        function compareFunc (first, second) {
          let firstTags = first[column].split(","),
              secondTags = second[column].split(",");
          let i = 0;
          while (true) {
            let t1 = firstTags[i], t2 = secondTags[i];
            if (t2 && !t1) return -1;
            if (t1 && !t2) return 1;
            if (!t1 && !t2) return 0;
            let comp = CompareLowerCase(t1, t2);
            if (comp != 0) return comp;
            i++;
          }
        }
        table.sort(ascending ? compareFunc :
                   function (first, second) -compareFunc(first, second));

        tree.treeBoxObject.invalidate();
        return ascending;
      } else if (column == "metadataType") {
        let compareFunc;

        if (ascending)
          compareFunc = function (first, second)
            CompareLowerCase(first[column], second[column]);
        else
          compareFunc = function (first, second)
            CompareLowerCase(second[column], first[column]);
        table.sort(compareFunc);

        tree.treeBoxObject.invalidate();
        return ascending;
      } else
        return origSortTree(tree, view, table, column, lastSortColumn,
                            lastSortAscending, updateSelection);
    }
    SortTree = ptagsSortTree;

    document.removeEventListener("DOMContentLoaded", dclHandler, false);
  },
  false);

var passwordTags = {
  editTags: function () {
    var tree = document.getElementById("signonsTree");
    var idx = tree.currentIndex;
    var tagsColObj = tree.columns.getNamedColumn("tagsCol");
    tree.startEditing(idx, tagsColObj);
  },

  editMetadata: function () {
    var tree = document.getElementById("signonsTree");
    var idx = tree.currentIndex;
    var signon = signonsTreeView._filterSet.length ?
                 signonsTreeView._filterSet[idx] : signons[idx];
    window.openDialog(
      "chrome://passwordtags/content/metadataEditor.xul", "",
      "centerscreen,dependent,dialog,chrome,modal,resizable",
      signon, null);
    LoadSignons();
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
          + promptSvc.BUTTON_POS_2*promptSvc.BUTTON_TITLE_IS_STRING,
        null, null, strings.getString("confirmDeleteMetadata_always.label"),
        null, {});
      if (res == 1)
        return;
      else if (res == 2)
        prefBranch.setBoolPref("promptForDeleteMetadata", false);
    }

    var tree = document.getElementById("signonsTree");
    var idx = tree.currentIndex;
    var signon = signonsTreeView._filterSet.length ?
                 signonsTreeView._filterSet[idx] : signons[idx];
    this.signonMetadataStorage.removeMetadata(signon);
    LoadSignons();
  },
};

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm", passwordTags);
