var request = require('request');

function getUsers(callback) {
  var body = '';
  var req = request('http://sharebill.qpgc.org/_view/totals?group=true&group_level=1', function(error, res, body) {
    if (error || res.statusCode != 200) {
      return callback('Failed to get users from sharebill');
    }

    try {
      return callback(null, (JSON.parse(body)).rows.map(function(o) { return o.key[0]; }));
    } catch(e) {
      return callback('Failed to parse sharebill users.');
    }
  });
}

function ISODateString(d){
  function pad(n){return n<10 ? '0'+n : n;}
  return d.getUTCFullYear()+'-'
    + pad(d.getUTCMonth()+1)+'-'
    + pad(d.getUTCDate())+'T'
    + pad(d.getUTCHours())+':'
    + pad(d.getUTCMinutes())+':'
    + pad(d.getUTCSeconds())+'.'
    + pad(d.getUTCMilliseconds())+'Z';
};

function postBill(debits, total, payid, callback) {
  getUsers(function(err, users) {
    if (err) return callback(err);

    if (users.indexOf(payid) === -1) {
      return callback('Invalid payment id '+payid);
    }

    var invalid = Object.keys(debits).filter(function(i) {
      return users.indexOf(i) === -1;
    });

    if (invalid.length > 0) {
      return callback(invalid.length===1
        ? 'Missing alias for the following user '+invalid.join(', ')
        : 'Missing aliases for the following users '+invalid.join(', '));
    }

    var contents = {
      'meta' : {
        'description' : 'MakiBot 9000',
        'timestamp' : ISODateString(new Date())
      },
      'transaction' : {
        'debets' : debits,
        'credits' : {
        }
      }
    };
    contents.transaction.credits[payid] = ''+total;

    return request.post({
      url : 'http://sharebill.qpgc.org/the_database/',
      body : contents,
      json : true
    }, function (err, res, body) {
      if (err || res.statusCode >= 400) {
        return callback('Failed to post bill to sharebill - ' + (err || JSON.stringify({code: res.statusCode, body: body})));
      } else {
        // Let's pretend I did this properly.
        var ret = 'http://sharebill.qpgc.org/post/'+body.id;
        return callback(null, ret);
      }
    });
  });
}

module.exports = postBill;
