const request = require('request');
const _ = require('underscore');

var beerFilterCollectionFormatter = {
  queryString: function(beerStyle) {
    var output;
    request('http://apis.mondorobot.com/beer-filters', function (error, response, body) {
      attributeList = JSON.parse(body).beer_filters;
      var styleAndStyleType = {};
      _.map(attributeList, function(val, key) {
        _.each(val, function(hash) {
          styleAndStyleType[hash.name] = key;
        });
      });
      var styleType = styleAndStyleType[beerStyle];
      //console.log(styleType + "=" + beerStyle);
      output = styleType + "=" + beerStyle;
    });
    return output;
  }
}

module.exports = beerFilterCollectionFormatter;
