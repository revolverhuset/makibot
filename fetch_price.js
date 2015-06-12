var menuPages = [
  'http://www.isushi.no/maki',
  'http://www.isushi.no/mix/',
  'http://www.isushi.no/kombo-4/',
  'http://www.isushi.no/maki-box/',
  'http://www.isushi.no/nigiri/',
  'http://www.isushi.no/sashimi/',
  'http://www.isushi.no/smaretter/',
  'http://www.isushi.no/ekstra/'
];

var jsdom = require('jsdom');
var async = require('async');

async.map(menuPages, function(page, cb) {
  jsdom.env(page, function(err, window) {
    if (err) return cb();
    var items = window.document.querySelectorAll('.one-quarter');
    var collected = [];
    items.forEach(function(item) {
      var title = item.querySelector('h4 span');
      if (!title) return;
      var menuItem = { name: title.innerText };
      var desc = item.querySelector('p');
      var matchPrice = /(\d+),[\d-]+\s*$/;
      if (!desc || !desc.innerText.match(matchPrice)) {
        menuItem.price = 0;
        collected.push(menuItem);
        return;
      }

      var price = desc.innerText.match(matchPrice)[1];
      menuItem.price = parseInt(price, 10);

      collected.push(menuItem);
    });
    callback(null, collected);
  });
}, function(err, pageItems) {
  var menu = _.flatten(pageItems);
  console.log(menu);
})

