/*
    Password Tags, extension for Firefox 3.5+ and others
    Copyright (C) 2010  Daniel Dawson <ddawson@icehouse.net>

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
    const catStorage =
      Components.classes["@daniel.dawson/signoncategorystorage;1"].
      getService(Components.interfaces.ddISignonCategoryStorage);
    var cols = document.getElementById("passwordsTree").firstChild;
    cols.appendChild(document.getElementById("pwdTagsColSplitter"));
    cols.appendChild(document.getElementById("pwdTagsCol"));

    // Replacing functions to "wedge" in our functionality
    // Is there a better way to accomplish this?
    var origGetCellText = gPasswords.getCellText;
    function ptagsGetCellText (aRow, aColumn) {
      var signon = this.displayedSignons[aRow]
      return aColumn.id == "pwdTagsCol" ?
        catStorage.getCategory(signon) :
        origGetCellText.call(this, aRow, aColumn);
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
        catStorage.setCategory(signon, aValue);
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

    var origHandleKeyPress = gPasswords.handleKeyPress;
    function ptagsHandleKeyPress (evt) {
      if (evt.charCode ==
            document.getElementById("pwdtagsStrbundle").
              getString("edittagsAccesskey").charCodeAt(0) &&
          !evt.altKey && !evt.ctrlKey && !evt.metaKey &&
          this.tree.editingRow == -1) {
        this.ptags_edittags(evt);
      } else if (this.tree.editingRow == -1)
        return origHandleKeyPress.call(this, evt);
    }
    gPasswords.handleKeyPress = ptagsHandleKeyPress;

    function cloneLoginInfo (aLoginInfo) ({
      cloned: true,
      hostname: aLoginInfo.hostname,
      httpRealm: aLoginInfo.httpRealm,
      formSubmitURL: aLoginInfo.formSubmitURL,
      username: aLoginInfo.username,
      password: aLoginInfo.password,
      usernameField: aLoginInfo.usernameField,
      passwordField: aLoginInfo.passwordField
    });

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

      if (!column || column.id != "pwdTagsCol")
        return origSort.call(this, column);

      var signons = this.displayedSignons;
      for (let i = 0; i < signons.length; i++) {
        var tags = catStorage.getCategory(signons[i]);
        if (!signons[i].cloned) signons[i] = cloneLoginInfo(signons[i]);
        signons[i].tags = tags;
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
      let compfunc = function ptags_compare(aOne, aTwo) {
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
