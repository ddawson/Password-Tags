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
    var cols = document.getElementById("signonsTree").firstChild;
    cols.appendChild(document.getElementById("tagsColSplitter"));
    cols.appendChild(document.getElementById("tagsCol"));

    // Replacing functions to "wedge" in our functionality
    // Is there a better way to accomplish this?
    var origGetCellText = signonsTreeView.getCellText;
    function ptagsGetCellText (row, column) {
      var signon = this._filterSet.length ?
                   this._filterSet[row] : signons[row];
      return column.id == "tagsCol" ? catStorage.getCategory(signon) :
                                     origGetCellText.call(this, row, column);
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
        let signon = signonsTreeView._filterSet.length ?
                     signonsTreeView._filterSet[row] : signons[row];
        catStorage.setCategory(signon, value);
        LoadSignons();
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
        ptags_edittags();
      else if (tree.editingRow == -1)
        return origHandleSignonKeyPress(evt);
    }
    HandleSignonKeyPress = ptagsHandleSignonKeyPress;

    var origGetColumnByName = window.getColumnByName;
    if (!origGetColumnByName) origGetColumnByName = function () null;
    function ptagsGetColumnByName (column)
      column == "tags" ? document.getElementById("tagsCol") :
                             origGetColumnByName(column);
    getColumnByName = ptagsGetColumnByName;

    function cloneLoginInfo (loginInfo) ({
      cloned: true,
      hostname: loginInfo.hostname,
      httpRealm: loginInfo.httpRealm,
      formSubmitURL: loginInfo.formSubmitURL,
      username: loginInfo.username,
      password: loginInfo.password,
      usernameField: loginInfo.usernameField,
      passwordField: loginInfo.passwordField
    });

    var origSignonColumnSort = window.SignonColumnSort;
    if (!origSignonColumnSort) origSignonColumnSort = function () {};
    function ptagsSignonColumnSort (column) {
      var l = signonsTreeView._filterSet.length;
      if (!l) {
        l = signons.length;
        for (let i = 0; i < l; i++) {
          var tags = catStorage.getCategory(signons[i]);
          if (!signons[i].cloned) signons[i] = cloneLoginInfo(signons[i]);
          signons[i].tags = tags;
        }
      } else {
        let fs = signonsTreeView._filterSet;
        for (let i = 0; i < l; i++) {
          var tags = catStorage.getCategory(fs[i]);
          if (!fs[i].cloned) fs[i] = cloneLoginInfo(fs[i]);
          fs[i].tags = tags;
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
      return false;
    }
    SignonMatchesFilter = ptagsSignonMatchesFilter;

    var origSortTree = window.SortTree;
    function ptagsSortTree (tree, view, table, column, lastSortColumn,
                            lastSortAscending, updateSelection) {
      if (column == "tags") {
        var ascending = (column == lastSortColumn) ? !lastSortAscending : true;
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
      } else
        return origSortTree(tree, view, table, column, lastSortColumn,
                            lastSortAscending, updateSelection);
    }
    SortTree = ptagsSortTree;

    document.removeEventListener("DOMContentLoaded", dclHandler, false);
  },
  false);

function ptags_edittags () {
  var tree = document.getElementById("signonsTree");
  var idx = tree.currentIndex;
  var tagsColObj = tree.columns.getNamedColumn("tagsCol");
  tree.startEditing(idx, tagsColObj);
}
