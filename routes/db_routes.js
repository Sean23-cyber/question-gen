const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const multer = require('multer');
const upload = multer();

const router = express.Router();

// Database connection
const db = mysql.createConnection({
  host: 'database-surprise.c3eiy4wi8u5e.ap-south-1.rds.amazonaws.com',
  user: 'admin',
  password: 'ffmL87LtJgD1IwON3pDB',
  port: 3306,
  multipleStatements: true
});

// Connect to the database and create the database and tables if they don't exist
db.connect((err) => {
  if (err) {
    console.error('❌ Connection failed:', err.stack);
    return;
  }
  console.log('✅ Connected to MySQL');

 const createDbAndTables = `
    CREATE DATABASE IF NOT EXISTS db_surprise;
    USE db_surprise;

    CREATE TABLE IF NOT EXISTS User (
      uid INT PRIMARY KEY,
      email VARCHAR(100) NOT NULL UNIQUE,
      phone_number VARCHAR(15),
      enrollment VARCHAR(50),
      branch VARCHAR(50),
      name VARCHAR(100),
      college VARCHAR(100)
    );

    CREATE TABLE IF NOT EXISTS Test (
      test_id INT PRIMARY KEY,
      creator_uid INT,
      test_password VARCHAR(255),
      start_time DATETIME,
      end_time DATETIME,
      duration INT,
      test_generated TEXT,
      test_title VARCHAR(255),
      FOREIGN KEY (creator_uid) REFERENCES User(uid)
    );

    CREATE TABLE IF NOT EXISTS HistoryCreated (
      creator_id INT,
      test_id INT,
      created_time DATETIME,
      total_participants INT,
      PRIMARY KEY (test_id),
      FOREIGN KEY (creator_id) REFERENCES User(uid),
      FOREIGN KEY (test_id) REFERENCES Test(test_id)
    );

    CREATE TABLE IF NOT EXISTS HistoryJoined (
      user_uid INT,
      test_id INT,
      joined_time DATETIME,
      score INT,
      test_report TEXT,
      PRIMARY KEY (user_uid, test_id),
      FOREIGN KEY (user_uid) REFERENCES User(uid),
      FOREIGN KEY (test_id) REFERENCES Test(test_id)
    );
  `;

  db.query(createDbAndTables, (err, results) => {
    if (err) {
      console.error('❌ Error setting up database and tables:', err);
    } else {
      console.log('✅ Database and tables created successfully!');
    }
  });
});

// Helper functions
function handleDatabaseError(res, err, operation) {
  console.error(`Error during ${operation}:`, err);
  res.status(500).json({ error: `Database error during ${operation}`, details: err.message });
}

// ===========================================
// USER MANAGEMENT APIs
// ===========================================

// Create a new user
router.post('/users', (req, res) => {
  const { uid, email, phone_number, enrollment, branch, name, college } = req.body;
  
  if (!uid || !email || !name) {
    return res.status(400).json({ error: 'Required fields missing: uid, email, and name are mandatory' });
  }
  
  const query = 'INSERT INTO User (uid, email, phone_number, enrollment, branch, name, college) VALUES (?, ?, ?, ?, ?, ?, ?)';
  db.query(query, [uid, email, phone_number, enrollment, branch, name, college], (err, result) => {
    if (err) {
      return handleDatabaseError(res, err, 'user creation');
    }
    res.status(201).json({ message: 'User created successfully', userId: uid });
  });
});

// Get all users
router.get('/users', (req, res) => {
  const query = 'SELECT * FROM User';
  db.query(query, (err, results) => {
    if (err) {
      return handleDatabaseError(res, err, 'fetching users');
    }
    res.json(results);
  });
});

// Get a specific user
router.get('/users/:uid', (req, res) => {
  const userId = req.params.uid;
  const query = 'SELECT * FROM User WHERE uid = ?';
  
  db.query(query, [userId], (err, results) => {
    if (err) {
      return handleDatabaseError(res, err, 'fetching user');
    }
    if (results.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(results[0]);
  });
});

// Update a user
router.put('/users/:uid', (req, res) => {
  const userId = req.params.uid;
  const { email, phone_number, enrollment, branch, name, college } = req.body;
  
  const query = `
    UPDATE User 
    SET email = ?, phone_number = ?, enrollment = ?, branch = ?, name = ?, college = ?
    WHERE uid = ?
  `;
  
  db.query(query, [email, phone_number, enrollment, branch, name, college, userId], (err, result) => {
    if (err) {
      return handleDatabaseError(res, err, 'updating user');
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'User updated successfully' });
  });
});

// Delete a user
router.delete('/users/:uid', (req, res) => {
  const userId = req.params.uid;
  
  // First check if user has any associated tests or history
  const checkQuery = `
    SELECT 1 FROM Test WHERE creator_uid = ? 
    UNION 
    SELECT 1 FROM HistoryCreated WHERE creator_id = ? 
    UNION 
    SELECT 1 FROM HistoryJoined WHERE user_uid = ?
    LIMIT 1
  `;
  
  db.query(checkQuery, [userId, userId, userId], (err, results) => {
    if (err) {
      return handleDatabaseError(res, err, 'checking user dependencies');
    }
    
    if (results.length > 0) {
      return res.status(400).json({ error: 'Cannot delete user with associated tests or history' });
    }
    
    const deleteQuery = 'DELETE FROM User WHERE uid = ?';
    db.query(deleteQuery, [userId], (err, result) => {
      if (err) {
        return handleDatabaseError(res, err, 'deleting user');
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json({ message: 'User deleted successfully' });
    });
  });
});

// ===========================================
// TEST MANAGEMENT APIs
// ===========================================

// Create a new test
router.post('/tests', upload.single('pdf_file'), (req, res) => {
  const { 
    test_id, creator_uid, test_password, start_time, 
    end_time, duration, test_generated, test_title 
  } = req.body;
  
  // PDF content from file upload
  const pdf_content = req.file ? req.file.buffer : null;
  
  if (!test_id || !creator_uid || !test_title) {
    return res.status(400).json({ error: 'Required fields missing: test_id, creator_uid, and test_title are mandatory' });
  }
  
  // Verify creator exists
  db.query('SELECT 1 FROM User WHERE uid = ?', [creator_uid], (err, results) => {
    if (err) {
      return handleDatabaseError(res, err, 'validating creator');
    }
    
    if (results.length === 0) {
      return res.status(404).json({ error: 'Creator user not found' });
    }
    
    const query = `
      INSERT INTO Test (
        test_id, creator_uid, test_password, pdf_content, 
        start_time, end_time, duration, test_generated, test_title
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
      test_id, creator_uid, test_password, pdf_content,
      start_time, end_time, duration, test_generated, test_title
    ];
    
    db.query(query, params, (err, result) => {
      if (err) {
        return handleDatabaseError(res, err, 'test creation');
      }
      
      res.status(201).json({ message: 'Test created successfully', testId: test_id });
    });
  });
});

// Get all tests
router.get('/tests', (req, res) => {
  // Don't include PDF content in the listing to reduce payload size
  const query = `
    SELECT test_id, creator_uid, start_time, end_time, 
    duration, test_generated, test_title 
    FROM Test
  `;
  
  db.query(query, (err, results) => {
    if (err) {
      return handleDatabaseError(res, err, 'fetching tests');
    }

    results.forEach(row => {
      if (typeof row.test_generated === 'string') {
        try {
          row.test_generated = JSON.parse(row.test_generated);
        } catch (err) {
          console.error("⚠️ Failed to parse test_generated for test_id:", row.test_id);
          row.test_generated = []; // fallback to empty array if parse fails
        }
      }
    });



    res.json(results);
  });
});

// Get tests created by a specific user
router.get('/users/:uid/tests', (req, res) => {
  const userId = req.params.uid;
  
  const query = `
    SELECT test_id, start_time, end_time, duration, test_title 
    FROM Test WHERE creator_uid = ?
  `;
  
  db.query(query, [userId], (err, results) => {
    if (err) {
      return handleDatabaseError(res, err, 'fetching user tests');
    }
    res.json(results);
  });
});

// Get a specific test
router.get('/tests/:testId', (req, res) => {
  const testId = req.params.testId;
  
  const query = `
    SELECT t.*, u.name as creator_name
    FROM Test t
    JOIN User u ON t.creator_uid = u.uid
    WHERE t.test_id = ?
  `;
  
  db.query(query, [testId], (err, results) => {
    if (err) {
      return handleDatabaseError(res, err, 'fetching test');
    }
    
    if (results.length === 0) {
      return res.status(404).json({ error: 'Test not found' });
    }
    
    // Convert the PDF content to base64 if present
    if (results[0].pdf_content) {
      results[0].pdf_content = results[0].pdf_content.toString('base64');
    }
    
    res.json(results[0]);
  });
});

// Get test PDF content
router.get('/tests/:testId/pdf', (req, res) => {
  const testId = req.params.testId;
  
  const query = 'SELECT pdf_content FROM Test WHERE test_id = ?';
  
  db.query(query, [testId], (err, results) => {
    if (err) {
      return handleDatabaseError(res, err, 'fetching test PDF');
    }
    
    if (results.length === 0 || !results[0].pdf_content) {
      return res.status(404).json({ error: 'Test PDF not found' });
    }
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="test-${testId}.pdf"`);
    res.send(results[0].pdf_content);
  });
});

// Update a test
router.put('/tests/:testId', upload.single('pdf_file'), (req, res) => {
  const testId = req.params.testId;
  const { 
    test_password, start_time, end_time, 
    duration, test_generated, test_title 
  } = req.body;
  
  // Check if PDF was uploaded
  const pdfUpdate = req.file ? ', pdf_content = ?' : '';
  let params = [];
  
  let query = `
    UPDATE Test 
    SET test_password = ?, start_time = ?, end_time = ?, 
    duration = ?, test_generated = ?, test_title = ?${pdfUpdate}
    WHERE test_id = ?
  `;
  
  // Build params array based on whether PDF was uploaded
  if (req.file) {
    params = [
      test_password, start_time, end_time, duration, 
      test_generated, test_title, req.file.buffer, testId
    ];
  } else {
    params = [
      test_password, start_time, end_time, duration, 
      test_generated, test_title, testId
    ];
  }
  
  db.query(query, params, (err, result) => {
    if (err) {
      return handleDatabaseError(res, err, 'updating test');
    }
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Test not found' });
    }
    
    res.json({ message: 'Test updated successfully' });
  });
});

// Delete a test
router.delete('/tests/:testId', (req, res) => {
  const testId = req.params.testId;
  
  // First check if test has any history records
  const checkQuery = `
    SELECT 1 FROM HistoryCreated WHERE test_id = ? 
    UNION 
    SELECT 1 FROM HistoryJoined WHERE test_id = ?
    LIMIT 1
  `;
  
  db.query(checkQuery, [testId, testId], (err, results) => {
    if (err) {
      return handleDatabaseError(res, err, 'checking test dependencies');
    }
    
    if (results.length > 0) {
      return res.status(400).json({ error: 'Cannot delete test with associated history records' });
    }
    
    const deleteQuery = 'DELETE FROM Test WHERE test_id = ?';
    db.query(deleteQuery, [testId], (err, result) => {
      if (err) {
        return handleDatabaseError(res, err, 'deleting test');
      }
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Test not found' });
      }
      
      res.json({ message: 'Test deleted successfully' });
    });
  });
});

// Validate test password
router.post('/tests/:testId/validate-password', (req, res) => {
  const testId = req.params.testId;
  const { password } = req.body;
  
  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }
  
  const query = 'SELECT test_password FROM Test WHERE test_id = ?';
  
  db.query(query, [testId], (err, results) => {
    if (err) {
      return handleDatabaseError(res, err, 'validating test password');
    }
    
    if (results.length === 0) {
      return res.status(404).json({ error: 'Test not found' });
    }
    
    const isValid = password === results[0].test_password;
    
    res.json({ 
      valid: isValid,
      message: isValid ? 'Password is valid' : 'Invalid password'
    });
  });
});

// ===========================================
// HISTORY APIs
// ===========================================

// Record a test creation history
router.post('/history/created', (req, res) => {
  const { creator_id, test_id, created_time, total_participants } = req.body;
  
  if (!creator_id || !test_id) {
    return res.status(400).json({ error: 'Required fields missing: creator_id and test_id are mandatory' });
  }
  
  const query = `
    INSERT INTO HistoryCreated 
    (creator_id, test_id, created_time, total_participants)
    VALUES (?, ?, ?, ?, ?)
  `;
  
  db.query(query, [creator_id, test_id, created_time, total_participants], (err, result) => {
    if (err) {
      return handleDatabaseError(res, err, 'recording creation history');
    }
    
    res.status(201).json({ message: 'Creation history recorded successfully' });
  });
});

// Record a test join history
router.post('/history/joined', (req, res) => {
  const { uid, test_id, joined_time, marks_obtained } = req.body;
  
  if (!uid || !test_id) {
    return res.status(400).json({ error: 'Required fields missing: user_uid and test_id are mandatory' });
  }
  
  const query = `
    INSERT INTO HistoryJoined 
    (uid, test_id, joined_time, marks_obtained)  
    VALUES (?, ?, ?, ?)
  `;
  
  db.query(query, [uid, test_id, joined_time, marks_obtained], (err, result) => {
    if (err) {
      return handleDatabaseError(res, err, 'recording join history');
    }
    
    res.status(201).json({ message: 'Join history recorded successfully' });
  });
});

// Get history of tests created by a user
router.get('/users/:uid/history/created', (req, res) => {
  const userId = req.params.uid;
  
  const query = `
    SELECT hc.*, t.test_title
    FROM HistoryCreated hc
    JOIN Test t ON hc.test_id = t.test_id
    WHERE hc.creator_id = ?
  `;
  
  db.query(query, [userId], (err, results) => {
    if (err) {
      return handleDatabaseError(res, err, 'fetching creation history');
    }
    res.json(results);
  });
});

// Get history of tests joined by a user
router.get('/users/:uid/history/joined', (req, res) => {
  const userId = req.params.uid;
  
  const query = `
    SELECT hj.*, t.test_title, u.name as creator_name
    FROM HistoryJoined hj
    JOIN Test t ON hj.test_id = t.test_id
    JOIN User u ON t.creator_uid = u.uid
    WHERE hj.user_uid = ?
  `;
  
  db.query(query, [userId], (err, results) => {
    if (err) {
      return handleDatabaseError(res, err, 'fetching join history');
    }
    res.json(results);
  });
});

// Get detailed history for a specific test
router.get('/tests/:testId/history', (req, res) => {
  const testId = req.params.testId;
  
  const query = `
    SELECT 
      t.test_title,
      u.name as creator_name,
      COUNT(DISTINCT hj.user_uid) as participant_count,
      AVG(hc.score) as average_score,
      hc.performance_status
    FROM Test t
    JOIN User u ON t.creator_uid = u.uid
    LEFT JOIN HistoryCreated hc ON t.test_id = hc.test_id
    LEFT JOIN HistoryJoined hj ON t.test_id = hj.test_id
    WHERE t.test_id = ?
    GROUP BY t.test_id, t.test_title, u.name, hc.performance_status
  `;
  
  db.query(query, [testId], (err, results) => {
    if (err) {
      return handleDatabaseError(res, err, 'fetching test history');
    }
    
    if (results.length === 0) {
      return res.status(404).json({ error: 'Test not found' });
    }
    
    res.json(results[0]);
  });
});

// ===========================================
// STATISTICS AND DASHBOARD APIs
// ===========================================

// Get summary statistics for a user
router.get('/users/:uid/statistics', (req, res) => {
  const userId = req.params.uid;
  
  const query = `
    SELECT
      (SELECT COUNT(*) FROM Test WHERE creator_uid = ?) as tests_created,
      (SELECT COUNT(*) FROM HistoryJoined WHERE user_uid = ?) as tests_taken,
      (SELECT AVG(score) FROM HistoryCreated WHERE creator_id = ?) as average_score,
      (
        SELECT COUNT(DISTINCT hj.user_uid) 
        FROM Test t
        JOIN HistoryJoined hj ON t.test_id = hj.test_id
        WHERE t.creator_uid = ?
      ) as total_participants
  `;
  
  db.query(query, [userId, userId, userId, userId], (err, results) => {
    if (err) {
      return handleDatabaseError(res, err, 'fetching user statistics');
    }
    
    res.json(results[0]);
  });
});

// ===========================================
// SEARCH APIs
// ===========================================

// Search for tests
router.get('/search/tests', (req, res) => {
  const { query, creator, startDate, endDate } = req.query;
  
  let sqlQuery = `
    SELECT t.test_id, t.test_title, t.start_time, t.end_time,
           u.name as creator_name
    FROM Test t
    JOIN User u ON t.creator_uid = u.uid
    WHERE 1=1
  `;
  
  const params = [];
  
  if (query) {
    sqlQuery += ' AND t.test_title LIKE ?';
    params.push(`%${query}%`);
  }
  
  if (creator) {
    sqlQuery += ' AND u.name LIKE ?';
    params.push(`%${creator}%`);
  }
  
  if (startDate) {
    sqlQuery += ' AND t.start_time >= ?';
    params.push(startDate);
  }
  
  if (endDate) {
    sqlQuery += ' AND t.end_time <= ?';
    params.push(endDate);
  }
  
  db.query(sqlQuery, params, (err, results) => {
    if (err) {
      return handleDatabaseError(res, err, 'searching tests');
    }
    res.json(results);
  });
});

// Search for users
router.get('/search/users', (req, res) => {
  const { query, college, branch } = req.query;
  
  let sqlQuery = 'SELECT * FROM User WHERE 1=1';
  const params = [];
  
  if (query) {
    sqlQuery += ' AND (name LIKE ? OR email LIKE ?)';
    params.push(`%${query}%`, `%${query}%`);
  }
  
  if (college) {
    sqlQuery += ' AND college LIKE ?';
    params.push(`%${college}%`);
  }
  
  if (branch) {
    sqlQuery += ' AND branch LIKE ?';
    params.push(`%${branch}%`);
  }
  
  db.query(sqlQuery, params, (err, results) => {
    if (err) {
      return handleDatabaseError(res, err, 'searching users');
    }
    res.json(results);
  });
});

module.exports = {
    router: router,
    db: db  // Export the db connection along with the router
};
