app.get('/api/test-report/:testId', (req, res) => {
    const testId = req.params.testId;
    
    db.connect((err) => {
      if (err) {
        console.error('❌ Database connection failed:', err);
        return res.status(500).json({ error: 'Database connection failed' });
      }
      
      // First query: Get test details
      const query_test_details = `SELECT * FROM Test WHERE test_id = ${testId}`;
      
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
        
        // Second query: Get user details for the test
        const test_user_details = `
        SELECT h.joined_time, h.score, u.name, u.email, u.enrollment, u.branch, 
               u.phone_number, u.college 
        FROM HistoryJoined h, User u 
        WHERE h.user_uid = u.uid AND h.test_id = ${testId}`;
        
        db.query(test_user_details, [testId], (err, user_results) => {
          if (err) {
            console.error('❌ Error fetching user details:', err);
            db.end();
            return res.status(500).json({ error: 'Error fetching user details' });
          }
          
          // Generate PDF
          const pdfFilePath = generatePDF(test_details, user_results, testId);
          
          // Close database connection
          db.end();
          
          // Send the PDF file
          res.download(pdfFilePath, `test_report_${testId}.pdf`, (err) => {
            if (err) {
              console.error('❌ Error sending PDF:', err);
              return res.status(500).json({ error: 'Error sending PDF' });
            }
            
            // Delete the file after sending
            fs.unlink(pdfFilePath, (err) => {
              if (err) {
                console.error('❌ Error deleting PDF file:', err);
              } else {
                console.log(`✅ PDF file deleted successfully: ${pdfFilePath}`);
              }
            });
          });
        });
      });
    });
  });
  function generatePDF(test_details, user_results,filename) {
    // Create a document with landscape orientation
    const doc = new PDFDocument({ layout: "landscape" });
  
    // Pipe its output to a file
    doc.pipe(fs.createWriteStream(filename));
  
    // Add title
    doc.fontSize(20).text("Test Report", { align: "center" });
    doc.moveDown(2); // Increased line spacing
  
    // Add test details
    doc.fontSize(16).text("Test Details:");
    doc.moveDown(1); // Increased line spacing
  
    if (test_details && test_details.length > 0) {
      const test = test_details[0];
      Object.keys(test).forEach((key) => {
        doc.fontSize(12).text(`${key}: ${test[key]}`);
        doc.moveDown(0.5); // Added spacing between test detail lines
      });
    } else {
      doc.fontSize(12).text("No test details found.");
    }
  
    doc.moveDown(2); // Increased line spacing
  
    // Add user details
    doc.fontSize(16).text("User Details:");
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
        doc
          .fontSize(10)
          .text(header, xPos, currentY, { width: colWidths[i], align: "left" });
        xPos += colWidths[i];
      });
  
      currentY += 20; // Header spacing
      doc.moveTo(50, currentY).lineTo(750, currentY).stroke();
      currentY += 15; // Increased spacing after header line
  
      // Draw rows with increased spacing (3x)
      user_results.forEach((user) => {
        if (currentY > 500) {
          doc.addPage({ layout: "landscape" });
          currentY = 50;
        }
  
        xPos = 50;
        headers.forEach((header, i) => {
          const cellValue =
            user[header] !== null ? user[header].toString() : "";
          doc
            .fontSize(10)
            .text(cellValue, xPos, currentY, {
              width: colWidths[i],
              align: "left",
            });
          xPos += colWidths[i];
        });
  
        currentY += 60; // 3x the original spacing (was 20)
      });
    } else {
      doc.fontSize(12).text("No user details found.");
    }
  
    // Finalize PDF
    doc.end();
    console.log(`✅ PDF generated successfully: ${filename}`);
  }
  
  function calculateColumnWidths(data, totalWidth) {
    if (!data || data.length === 0) return [];
  
    const headers = Object.keys(data[0]);
    const numColumns = headers.length;
  
    // Simple equal distribution
    return Array(numColumns).fill(totalWidth / numColumns);
  }
  
