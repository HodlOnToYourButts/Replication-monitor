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

app.get('/debug/replications', async (req, res) => {
  res.json({ message: 'Debug endpoint working' });
});

app.get('/debug/replications/full', async (req, res) => {
  try {
    const replicationDocs = await couchdb.db.use('_replicator').list({
      include_docs: true
    });
    
    res.json({
      total_rows: replicationDocs.rows.length,
      rows: replicationDocs.rows
    });
    
  } catch (error) {
    console.error('Error fetching all replications:', error);
    res.status(500).json({
      error: 'Failed to fetch replications',
      message: error.message
    });
  }
});

app.get('/replication/status/:database', async (req, res) => {
  try {
    const { database } = req.params;
    const { target } = req.query;
    
    const replicationDocs = await couchdb.db.use('_replicator').list({
      include_docs: true
    });
    
    let dbReplications = replicationDocs.rows
      .map(row => row.doc)
      .filter(doc => {
        if (!doc) return false;
        
        const sourceUrl = typeof doc.source === 'object' ? doc.source.url : doc.source;
        const targetUrl = typeof doc.target === 'object' ? doc.target.url : doc.target;
        
        return sourceUrl === database || 
               targetUrl === database ||
               (typeof sourceUrl === 'string' && sourceUrl.includes(`/${database}`)) ||
               (typeof targetUrl === 'string' && targetUrl.includes(`/${database}`));
      });
    
    if (target === 'true') {
      dbReplications = dbReplications.filter(doc => {
        const targetUrl = typeof doc.target === 'object' ? doc.target.url : doc.target;
        return targetUrl === database || 
               (typeof targetUrl === 'string' && targetUrl.includes(`/${database}`));
      });
    }
    
    const replications = dbReplications.map(doc => {
      const now = new Date();
      let lastSuccessTime = null;
      let timeSinceLastSuccess = null;
      
      if (doc._replication_state_time) {
        lastSuccessTime = new Date(doc._replication_state_time);
        timeSinceLastSuccess = Math.floor((now - lastSuccessTime) / 1000);
      }
      
      const sourceUrl = typeof doc.source === 'object' ? doc.source.url : doc.source;
      const targetUrl = typeof doc.target === 'object' ? doc.target.url : doc.target;
      
      return {
        id: doc._id,
        source: sourceUrl,
        target: targetUrl,
        state: doc._replication_state,
        last_state_change: doc._replication_state_time,
        time_since_last_update_seconds: timeSinceLastSuccess,
        stats: doc._replication_stats || null
      };
    });
    
    res.json({
      database,
      target_filter: target === 'true',
      replications
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