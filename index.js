require('dotenv').config();
const express = require('express');
const nano = require('nano');

const app = express();
const port = process.env.PORT || 8080;

const couchdbUrl = process.env.COUCHDB_URL || 'http://localhost:5984';
const adminUser = process.env.COUCHDB_ADMIN_USER || 'admin';
const adminPassword = process.env.COUCHDB_ADMIN_PASSWORD || 'password';

const couchdb = nano(`${couchdbUrl.replace('://', `://${adminUser}:${adminPassword}@`)}`);

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'replication-monitor' });
});

app.get('/replication/status/:database', async (req, res) => {
  try {
    const { database } = req.params;
    
    const db = couchdb.db.use(database);
    const info = await db.info();
    
    const replicationDocs = await couchdb.db.use('_replicator').list({
      include_docs: true
    });
    
    const dbReplications = replicationDocs.rows
      .map(row => row.doc)
      .filter(doc => doc && (doc.source === database || doc.target === database))
      .map(doc => ({
        id: doc._id,
        source: doc.source,
        target: doc.target,
        state: doc._replication_state,
        last_updated: doc._replication_state_time
      }));
    
    res.json({
      database,
      info: {
        doc_count: info.doc_count,
        update_seq: info.update_seq,
        purge_seq: info.purge_seq
      },
      replications: dbReplications
    });
    
  } catch (error) {
    console.error('Error checking replication status:', error);
    res.status(500).json({
      error: 'Failed to check replication status',
      message: error.message
    });
  }
});

app.get('/replication/status/:database/:replication_id', async (req, res) => {
  try {
    const { database, replication_id } = req.params;
    
    const replicatorDb = couchdb.db.use('_replicator');
    const replicationDoc = await replicatorDb.get(replication_id);
    
    if (replicationDoc.source !== database && replicationDoc.target !== database) {
      return res.status(404).json({
        error: 'Replication not found for this database'
      });
    }
    
    res.json({
      id: replicationDoc._id,
      source: replicationDoc.source,
      target: replicationDoc.target,
      state: replicationDoc._replication_state,
      last_updated: replicationDoc._replication_state_time,
      stats: replicationDoc._replication_stats || null
    });
    
  } catch (error) {
    console.error('Error getting replication details:', error);
    res.status(500).json({
      error: 'Failed to get replication details',
      message: error.message
    });
  }
});

app.listen(port, () => {
  console.log(`Replication monitor service running on port ${port}`);
});

module.exports = app;