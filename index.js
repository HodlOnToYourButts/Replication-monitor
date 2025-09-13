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

app.get('/', (req, res) => {
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

app.get('/debug/active-tasks', async (req, res) => {
  try {
    const activeTasks = await couchdb.request({
      path: '_active_tasks'
    });
    
    res.json(activeTasks);
    
  } catch (error) {
    console.error('Error fetching active tasks:', error);
    res.status(500).json({
      error: 'Failed to fetch active tasks',
      message: error.message
    });
  }
});

app.get('/debug/scheduler-jobs', async (req, res) => {
  try {
    const schedulerJobs = await couchdb.request({
      path: '_scheduler/jobs'
    });
    
    res.json(schedulerJobs);
    
  } catch (error) {
    console.error('Error fetching scheduler jobs:', error);
    res.status(500).json({
      error: 'Failed to fetch scheduler jobs',
      message: error.message
    });
  }
});

app.get('/replication/status/:database', async (req, res) => {
  try {
    const { database } = req.params;
    const { target } = req.query;
    
    // Get replication configurations
    const replicationDocs = await couchdb.db.use('_replicator').list({
      include_docs: true
    });
    
    // Get live replication status
    const [activeTasks, schedulerJobs] = await Promise.all([
      couchdb.request({ path: '_active_tasks' }),
      couchdb.request({ path: '_scheduler/jobs' })
    ]);
    
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
      const sourceUrl = typeof doc.source === 'object' ? doc.source.url : doc.source;
      const targetUrl = typeof doc.target === 'object' ? doc.target.url : doc.target;
      
      // Find matching active task
      const activeTask = activeTasks.find(task => task.doc_id === doc._id);
      
      // Find matching scheduler job
      const schedulerJob = schedulerJobs.jobs.find(job => job.doc_id === doc._id);
      
      // Determine status
      let status = 'unknown';
      let lastActivity = null;
      let timeSinceLastActivity = null;
      
      if (activeTask) {
        status = activeTask.process_status === 'waiting' ? 'running' : activeTask.process_status;
        lastActivity = new Date(activeTask.updated_on * 1000);
        timeSinceLastActivity = Math.floor((Date.now() - lastActivity.getTime()) / 1000);
      }
      
      // Check for recent crashes in scheduler history
      if (schedulerJob && schedulerJob.history && schedulerJob.history.length > 0) {
        const recentHistory = schedulerJob.history.slice(0, 2);
        const hasCrashed = recentHistory.some(event => event.type === 'crashed');
        if (hasCrashed && status === 'running') {
          status = 'retrying';
        }
      }
      
      return {
        id: doc._id,
        source: sourceUrl,
        target: targetUrl,
        status: status,
        continuous: doc.continuous || false,
        last_activity: lastActivity,
        time_since_last_activity_seconds: timeSinceLastActivity,
        stats: activeTask ? {
          docs_read: activeTask.docs_read || 0,
          docs_written: activeTask.docs_written || 0,
          doc_write_failures: activeTask.doc_write_failures || 0,
          revisions_checked: activeTask.revisions_checked || 0,
          changes_pending: activeTask.changes_pending
        } : null,
        recent_errors: schedulerJob && schedulerJob.history ? 
          schedulerJob.history
            .filter(event => event.type === 'crashed')
            .slice(0, 3)
            .map(event => ({
              timestamp: event.timestamp,
              reason: event.reason
            })) : []
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