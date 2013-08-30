/*
    Password Tags, extension for Firefox and others
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
    var signonMetadataStorage;
    {
      let scopeObj = {};
      Components.utils.import(
        "resource://passwordtags/signonMetadataStorage.jsm", scopeObj);
      signonMetadataStorage = scopeObj.signonMetadataStorage;
    }

    var cols = document.getElementById("passwordsTree").firstChild;
    var ord = parseInt(cols.lastChild.ordinal) + 1;
    for each (let id in ["pwdTagsColSplitter", "pwdTagsCol",
                         "pwdMetadataColSplitter", "pwdMetadataCol"]) {
      let el = document.getElementById(id);
      el.ordinal = ord++;
      cols.appendChild(el);
    }

    // Replacing functions to "wedge" in our functionality
    // Is there a better way to accomplish this?
    var origGetCellText = gPasswords.getCellText;
    function ptagsGetCellText (aRow, aColumn) {
      var signon = this.displayedSignons[aRow];
      switch (aColumn.id) {
      case "pwdTagsCol":
        return signonMetadataStorage.getTags(signon);
        break;

      case "pwdMetadataCol":
        let mdRawObj =
          signonMetadataStorage.getMetadataRaw(signon);
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
        return origGetCellText.call(this, aRow, aColumn);
        break;
      }
    }
    gPasswords.getCellText = ptagsGetCellText;

    var origIsEditable = gPasswords.isEditable;
    if (!origIsEditable) origIsEditable = function () false;
    function ptagsIsEditable (aRow, aCol)
      aCol.id == "pwdTagsCol" ? true : origIsEditable.call(this, aRow, aCol);
    gPasswords.isEditable = ptagsIsEditable;

    var origSetCellText = gPasswords.setCellText;
    if (!origSetCellText) origSetCellText = function () {};
    function ptagsSetCellText (aRow, aCol, aValue) {
      if (aCol.id == "pwdTagsCol") {
        let signon = this.displayedSignons[aRow];
        signonMetadataStorage.setTags(signon, aValue);
        this.sort(null, false, false);
      }
      origSetCellText.call(this, aRow, aCol, aValue);
    }
    gPasswords.setCellText = ptagsSetCellText;

    function ptagsEdittags (evt) {
        var idx = this.tree.currentIndex;
        var tagsColObj = this.tree.columns.getNamedColumn("pwdTagsCol");
        this.tree.startEditing(idx, tagsColObj);
        evt.stopPropagation();
    }
    gPasswords.ptags_edittags = ptagsEdittags;

    function ptagsEditmetadata (evt) {
      var selections = gDataman.getTreeSelections(gPasswords.tree);

      function __finish () {
        gPasswords.initialize();
        gPasswords.tree.view.selection.select(selections[0]);
      }

      var idx = this.tree.currentIndex;
      var signon = this.displayedSignons[idx];
      var ww = Components.classes["@mozilla.org/embedcomp/window-watcher;1"].
        getService(Components.interfaces.nsIWindowWatcher);
      const WINDOW_NAME = "danieldawson:passwordtags-editor";
      var oldWin = ww.getWindowByName(WINDOW_NAME, null);

      if (!oldWin)
        window.openDialog(
          "chrome://passwordtags/content/metadataEditor.xul", WINDOW_NAME,
          "centerscreen,dependent,dialog,chrome,resizable",
          signon, __finish);
      else
        oldWin.focus();
    }
    gPasswords.ptags_editmetadata = ptagsEditmetadata;

    function ptagsDeletemetadata (evt) {
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

      var selections = gDataman.getTreeSelections(gPasswords.tree);
      var idx = this.tree.currentIndex;
      var signon = this.displayedSignons[idx];
      signonMetadataStorage.removeMetadata(signon);
      gPasswords.initialize();
      gPasswords.tree.view.selection.select(selections[0]);
    }
    gPasswords.ptags_deletemetadata = ptagsDeletemetadata;

    var origHandleKeyPress = gPasswords.handleKeyPress;
    function ptagsHandleKeyPress (evt) {
      if (evt.charCode ==
            document.getElementById("pwdtagsStrbundle").
              getString("edittagsAccesskey").charCodeAt(0) &&
          !evt.altKey && !evt.ctrlKey && !evt.metaKey &&
          this.tree.editingRow == -1) {
        this.ptags_edittags(evt);
      } else if (evt.charCode ==
                   document.getElementById("pwdtagsStrbundle").
                     getString("editmetadataAccesskey").charCodeAt(0) &&
                 !evt.altKey && !evt.ctrlKey && !evt.metaKey &&
                 this.tree.editingRow == -1) {
        this.ptags_editmetadata(evt);
      } else if (this.tree.editingRow == -1)
        return origHandleKeyPress.call(this, evt);
    }
    gPasswords.handleKeyPress = ptagsHandleKeyPress;

    function cloneLoginInfo (aLoginInfo) {
      var obj = {
        QueryInterface: function (aIID) {
          if (aIID.equals(Components.interfaces.nsISupports)
              || aIID.equals(Components.interfaces.nsILoginInfo)
              || aIID.equals(Components.interfaces.nsILoginMetaInfo))
            return this;

          throw Components.results.NS_ERROR_NO_INTERFACE;
        },
        cloned: true
      };
      aLoginInfo.QueryInterface(Components.interfaces.nsILoginMetaInfo);
      for each (let name in ["hostname", "httpRealm", "formSubmitURL",
                             "username", "password", "usernameField",
                             "passwordField", "guid", "timeCreated",
                             "timeLastUsed", "timePasswordChanged",
                             "timesUsed"])
        obj[name] = aLoginInfo[name];
      return obj;
    }

    var origSort = gPasswords.sort;
    function ptagsSort (aColumn, aUpdateSelection, aInvertDirection) {
      // Duplicates and changes some code from gPasswords.sort() in
      // chrome://communicator/content/dataman/dataman.js

      // Make sure we have a valid column.
      let column = aColumn;
      if (!column) {
        let sortedCol = this.tree.columns.getSortedColumn();
        if (sortedCol)
          column = sortedCol.element;
      }

      if (!column || (column.id != "pwdTagsCol"
                      && column.id != "pwdMetadataCol"))
        return origSort.call(this, column, aUpdateSelection, aInvertDirection);

      var signons = this.displayedSignons;
      var tagsCol = document.getElementById("pwdTagsCol"),
          metadataCol = document.getElementById("pwdMetadataCol");
      for (let i = 0; i < signons.length; i++) {
        let tags = this.getCellText(i, tagsCol);
        let metadataType = this.getCellText(i, metadataCol);
        if (!signons[i].cloned) signons[i] = cloneLoginInfo(signons[i]);
        signons[i].tags = tags;
        signons[i].metadataType = metadataType;
      }

      let dirAscending = column.getAttribute("sortDirection") !=
                         (aInvertDirection ? "ascending" : "descending");
      let dirFactor = dirAscending ? 1 : -1;

      // Clear attributes on all columns, we're setting them again after
      // sorting.
      for (let node = column.parentNode.firstChild; node;
           node = node.nextSibling) {
        node.removeAttribute("sortActive");
        node.removeAttribute("sortDirection");
      }

      // compare function for two signons
      let compfunc;
      if (column.id == "pwdTagsCol")
        compfunc = function ptags_compare (aOne, aTwo) {
          let oneTags = aOne.tags.split(","),
              twoTags = aTwo.tags.split(",");
          let i = 0;
          while (true) {
            let t1 = oneTags[i], t2 = twoTags[i];
            if (t2 && !t1) return -dirFactor;
            if (t1 && !t2) return dirFactor;
            if (!t1 && !t2) return 0;
            let t1l = t1.toLowerCase(), t2l = t2.toLowerCase();
            let comp = t1l < t2l ? -1 : t1l > t2l ? 1 : 0;
            if (comp != 0) return dirFactor*comp;
            i++;
          }
        };
      else
        compfunc = function ptags_compare (aOne, aTwo) {
          var oneLC = aOne.metadataType.toLowerCase(),
              twoLC = aTwo.metadataType.toLowerCase();
          var comp = oneLC < twoLC ? -1 : oneLC > twoLC ? 1 : 0;
          return comp*dirFactor;
        };

      if (aUpdateSelection) {
        var selectionCache =
          gDataman.getSelectedIDs(this.tree, this._getObjID);
      }
      this.tree.view.selection.clearSelection();

      // Do the actual sorting of the array.
      this.displayedSignons.sort(compfunc);
      this.tree.treeBoxObject.invalidate();

      if (aUpdateSelection) {
        gDataman.restoreSelectionFromIDs(this.tree, this._getObjID,
                                         selectionCache);
      }

      // Set attributes to the sorting we did.
      column.setAttribute("sortActive", "true");
      column.setAttribute("sortDirection", dirAscending ? "ascending"
                                                        : "descending");
    }
    gPasswords.sort = ptagsSort;

    document.removeEventListener("DOMContentLoaded", dclHandler, false);
  },
  false);
