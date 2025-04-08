const mysql = require("mysql");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const path = require('path');

// Database connection
const dbConfig = {
  host: 'database-surprise.c3eiy4wi8u5e.ap-south-1.rds.amazonaws.com',
  user: 'admin',
  password: 'ffmL87LtJgD1IwON3pDB',
  port: 3306,
  database : 'db_surprise',
  multipleStatements: true
};

const router = require('express').Router();
router.get('/test-report/:testId', (req, res) => {
    const testId = req.params.testId;
    
    // Validate test ID
  if (!testId || isNaN(parseInt(testId))) {
    return res.status(400).json({ error: 'Invalid test ID' });
  }
  
  // Create database connection
  const db = mysql.createConnection(dbConfig);
  
  // Connect to database
  db.connect((err) => {
    if (err) {
      console.error('❌ Database connection failed:', err.stack);
      return res.status(500).json({ error: 'Database connection failed' });
    }
    
    console.log('✅ Connected to MySQL');
    
    // First query: Get test details
    const query_test_details = `
    SELECT test_title, test_id, test_password, start_time, end_time, duration, FROM Test WHERE test_id = ?;
    `;
    
    db.query(query_test_details, [testId], (err, test_details) => {
      if (err) {
        console.error('❌ Error fetching test details:', err);
        db.end();
        return res.status(500).json({ error: 'Error fetching test details' });
      }
      
      if (!test_details || test_details.length === 0) {
        db.end();
        return res.status(404).json({ error: 'Test not found' });
      }
      
      console.log('✅ Test details fetched successfully!');
      
      // Second query: Get user details for the test
      const test_user_details = `
      SELECT h.joined_time, h.score, u.name, u.email, u.enrollment, u.branch, 
             u.phone_number, u.college 
      FROM HistoryJoined h, User u 
      WHERE h.user_uid = u.uid AND h.test_id = ?;
      `;
      
      db.query(test_user_details, [testId], (err, user_results) => {
        if (err) {
          console.error('❌ Error fetching user details:', err);
          db.end();
          return res.status(500).json({ error: 'Error fetching user details' });
        }
        
        console.log('✅ User details fetched successfully!');
        
        // Create PDF filename with test ID
        const filename = `test_report_${testId}_${Date.now()}.pdf`;
        const filePath = path.join(__dirname, filename);
        
        // Generate PDF
        generatePDF(test_details, user_results, filePath, (err) => {
          // Close database connection
          db.end();
          
          if (err) {
            console.error('❌ Error generating PDF:', err);
            return res.status(500).json({ error: 'Error generating PDF' });
          }
          
          console.log(`✅ PDF generated successfully: ${filename}`);
          
          // Set headers for file download
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
          
          // Stream the file to the response
          const fileStream = fs.createReadStream(filePath);
          fileStream.pipe(res);
          
          // Clean up the file after sending
          fileStream.on('end', () => {
            fs.unlink(filePath, (err) => {
              if (err) console.error('❌ Error deleting temporary PDF file:', err);
              else console.log(`✅ Temporary PDF file deleted: ${filename}`);
            });
          });
        });
      });
    });
  });
});

function generatePDF(test_details, user_results, filePath, callback) {
  try {
    // Create a document with landscape orientation
    const doc = new PDFDocument({ layout: 'landscape' });
    
    // Pipe its output to a file
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);
    
    // Add title
    doc.fontSize(20).text('Test Report', { align: 'center' });
    doc.moveDown(2); // Increased line spacing
    
    // Add test details
    doc.fontSize(16).text('Test Details:');
    doc.moveDown(1); // Increased line spacing
    
    if (test_details && test_details.length > 0) {
      const test = test_details[0];
      Object.keys(test).forEach(key => {
        doc.fontSize(12).text(`${key}: ${test[key]}`);
        doc.moveDown(0.5); // Added spacing between test detail lines
      });
    } else {
      doc.fontSize(12).text('No test details found.');
    }
    
    doc.moveDown(2); // Increased line spacing
    
    // Add user details
    doc.fontSize(16).text('User Details:');
    doc.moveDown(1); // Increased line spacing
    
    if (user_results && user_results.length > 0) {
      // Create table header
      const tableTop = doc.y;
      let currentY = tableTop;
      
      // Calculate column widths
      const totalWidth = 700;
      const colWidths = calculateColumnWidths(user_results, totalWidth);
      const headers = Object.keys(user_results[0]);
      
      // Draw headers
      let xPos = 50;
      headers.forEach((header, i) => {
        doc.fontSize(10).text(header, xPos, currentY, { width: colWidths[i], align: 'left' });
        xPos += colWidths[i];
      });
      
      currentY += 20; // Header spacing
      doc.moveTo(50, currentY).lineTo(750, currentY).stroke();
      currentY += 15; // Increased spacing after header line
      
      // Draw rows with increased spacing (3x)
      user_results.forEach(user => {
        if (currentY > 500) {
          doc.addPage({ layout: 'landscape' });
          currentY = 50;
        }
        
        xPos = 50;
        headers.forEach((header, i) => {
          const cellValue = user[header] !== null ? user[header].toString() : '';
          doc.fontSize(10).text(cellValue, xPos, currentY, { width: colWidths[i], align: 'left' });
          xPos += colWidths[i];
        });
        
        currentY += 60; // 3x the original spacing (was 20)
      });
    } else {
      doc.fontSize(12).text('No user details found.');
    }
    
    // Event handlers for the stream
    writeStream.on('error', (err) => {
      callback(err);
    });
    
    writeStream.on('finish', () => {
      callback(null);
    });
    
    // Finalize PDF
    doc.end();
    
  } catch (err) {
    callback(err);
  }
}

function calculateColumnWidths(data, totalWidth) {
  if (!data || data.length === 0) return [];
  
  const headers = Object.keys(data[0]);
  const numColumns = headers.length;
  
  // Simple equal distribution
  return Array(numColumns).fill(totalWidth / numColumns);
}

module.exports = {
    router: router,
};
