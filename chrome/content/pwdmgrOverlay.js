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

var _origGetColumnByName, _pcatGetColumnByName,
    _origSignonColumnSort, _pcatSignonColumnSort,
    _origSignonMatchesFilter, _pcatSignonMatchesFilter;

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
    function pcatGetCellText (row, column) {
      var signon = signonsTreeView._filterSet.length ?
                   signonsTreeView._filterSet[row] : signons[row];
      if (column.id == "catCol") {
        var category = catStorage.getCategory(signon);
        return category;
      }
      return signonsTreeView._origGetCellText(row, column);
    }
    signonsTreeView._origGetCellText = signonsTreeView.getCellText;
    signonsTreeView._pcatGetCellText =
      signonsTreeView.getCellText = pcatGetCellText;

    function pcatIsEditable (row, col) {
      if (col.id == "catCol")
        return true;
      else
        return false;
    }
    signonsTreeView.isEditable = pcatIsEditable;

    function pcatSetCellText (row, col, value) {
      if (col.id == "catCol") {
        let signon = signonsTreeView._filterSet.length ?
                     signonsTreeView._filterSet[row] : signons[row];
        catStorage.setCategory(signon, value);
        LoadSignons();
      }
    }
    signonsTreeView.setCellText = pcatSetCellText;

    function pcatGetColumnByName (column) {
      if (column == "category")
        return document.getElementById("catCol");
      return _origGetColumnByName(column);
    }
    if (window.hasOwnProperty("getColumnByName")) {
      _origGetColumnByName = getColumnByName;
      _pcatGetColumnByName = getColumnByName = pcatGetColumnByName;
    }

    function cloneLoginInfo (loginInfo) {
      var obj = {
        cloned: true,
        hostname: loginInfo.hostname,
        httpRealm: loginInfo.httpRealm,
        formSubmitURL: loginInfo.formSubmitURL,
        username: loginInfo.username,
        password: loginInfo.password,
        usernameField: loginInfo.usernameField,
        passwordField: loginInfo.passwordField
      };
      return obj;
    }

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
      _origSignonColumnSort(column);
    }
    _origSignonColumnSort = SignonColumnSort;
    _pcatSignonColumnSort = SignonColumnSort = pcatSignonColumnSort;

    function pcatSignonMatchesFilter (signon, filterValue) {
      if (_origSignonMatchesFilter(signon, filterValue)) return true;
      if (signon.category &&
          signon.category.toLowerCase().indexOf(filterValue) != -1)
        return true;
      return false;
    }
    _origSignonMatchesFilter = SignonMatchesFilter;
    _pcatSignonMatchesFilter = SignonMatchesFilter = pcatSignonMatchesFilter;

    document.removeEventListener("DOMContentLoaded", dclHandler, false);
  },
  false);
