const Promise = require('promise');
const debug = require('debug')('bulk writer');

const BulkWriter = function BulkWriter(client, interval, waitForActiveShards, maxItemsAfterFlush) {
  this.client = client;
  this.interval = interval || 5000;
  this.waitForActiveShards = waitForActiveShards;
  this.maxItemsAfterFlush = maxItemsAfterFlush || 10000;

  this.bulk = []; // bulk to be flushed
  this.running = false;
  this.timer = false;
  debug('created', this);
};

BulkWriter.prototype.start = function start() {
  this.stop();
  this.running = true;
  this.tick();
  debug('started');
};

BulkWriter.prototype.stop = function stop() {
  this.running = false;
  if (!this.timer) { return; }
  clearTimeout(this.timer);
  this.timer = null;
  debug('stopped');
};

BulkWriter.prototype.schedule = function schedule() {
  const thiz = this;
  this.timer = setTimeout(() => {
    thiz.tick();
  }, this.interval);
};

BulkWriter.prototype.tick = function tick() {
  debug('tick');
  const thiz = this;
  if (!this.running) { return; }
  this.flush()
    .catch((e) => {
      thiz.schedule();
      throw e;
    })
    .then(() => {
      thiz.schedule();
    });
};

BulkWriter.prototype.flush = function flush() {
  // write bulk to elasticsearch
  if (this.bulk.length === 0) {
    debug('nothing to flush');

    return new Promise((resolve) => {
      return resolve();
    });
  }

  const bulk = this.bulk;
  this.bulk = [];
  debug('going to write', bulk);
  return this.client.bulk({
    body: bulk,
    waitForActiveShards: this.waitForActiveShards,
    timeout: this.interval + 'ms',
    type: this.type
  }).catch((e) => {
    // rollback this.bulk array
    this.bulk = bulk.concat(this.bulk);
    if (this.bulk.length > this.maxItemsAfterFlush) {
      this.bulk = this.bulk.slice(0, this.maxItemsAfterFlush * 2);
    }

    throw e;
  });
};

BulkWriter.prototype.append = function append(index, type, doc) {
  this.bulk.push({
    index: {
      _index: index, _type: type
    }
  });
  this.bulk.push(doc);
};

module.exports = BulkWriter;
