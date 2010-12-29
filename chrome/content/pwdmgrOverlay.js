/*
    Password Categories, extension for Firefox 3.5+ and others
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
    cols.appendChild(document.getElementById("catColSplitter"));
    cols.appendChild(document.getElementById("catCol"));

    // Replacing functions to "wedge" in our functionality
    // Is there a better way to accomplish this?
    var origGetCellText = signonsTreeView.getCellText;
    function pcatGetCellText (row, column) {
      var signon = this._filterSet.length ?
                   this._filterSet[row] : signons[row];
      return column.id == "catCol" ? catStorage.getCategory(signon) :
                                     origGetCellText.call(this, row, column);
    }
    signonsTreeView.getCellText = pcatGetCellText;

    var origIsEditable = signonsTreeView.isEditable;
    if (!origIsEditable) origIsEditable = function () false;
    function pcatIsEditable (row, col)
      col.id == "catCol" ? true : origIsEditable.call(this, row, col);
    signonsTreeView.isEditable = pcatIsEditable;

    var origSetCellText = signonsTreeView.setCellText;
    if (!origSetCellText) origSetCellText = function () {};
    function pcatSetCellText (row, col, value) {
      if (col.id == "catCol") {
        let signon = signonsTreeView._filterSet.length ?
                     signonsTreeView._filterSet[row] : signons[row];
        catStorage.setCategory(signon, value);
        LoadSignons();
      }
      origSetCellText.call(this, row, col, value);
    }
    signonsTreeView.setCellText = pcatSetCellText;

    var origGetColumnByName = getColumnByName;
    if (!origGetColumnByName) origGetColumnByName = function () null;
    function pcatGetColumnByName (column)
      column == "category" ? document.getElementById("catCol") :
                             origGetColumnByName(column);
    getColumnByName = pcatGetColumnByName;

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

    var origSignonColumnSort = SignonColumnSort;
    if (!origSignonColumnSort) origSignonColumnSort = function () {};
    function pcatSignonColumnSort (column) {
      var l = signonsTreeView._filterSet.length;
      if (!l) {
        l = signons.length;
        for (let i = 0; i < l; i++) {
          var category = catStorage.getCategory(signons[i]);
          if (!signons[i].cloned) signons[i] = cloneLoginInfo(signons[i]);
          signons[i].category = category;
        }
      } else {
        let fs = signonsTreeView._filterSet;
        for (let i = 0; i < l; i++) {
          var category = catStorage.getCategory(fs[i]);
          if (!fs[i].cloned) fs[i] = cloneLoginInfo(fs[i]);
          fs[i].category = category;
        }
      }
      origSignonColumnSort(column);
    }
    SignonColumnSort = pcatSignonColumnSort;

    var origSignonMatchesFilter = SignonMatchesFilter;
    if (!origSignonMatchesFilter) origSignonMatchesFilter = function () false;
    function pcatSignonMatchesFilter (signon, filterValue) {
      if (origSignonMatchesFilter(signon, filterValue)) return true;
      if (signon.category &&
          signon.category.toLowerCase().indexOf(filterValue) != -1)
        return true;
      return false;
    }
    SignonMatchesFilter = pcatSignonMatchesFilter;

    document.removeEventListener("DOMContentLoaded", dclHandler, false);
  },
  false);
