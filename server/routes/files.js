const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { promisify } = require('util');
const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);

// Google Translate API function
async function translateText(text, targetLang = 'en') {
  try {
    // Get API key from environment variables
    const apiKey = process.env.GOOGLE_API_KEY;
    
    if (!apiKey) {
      console.warn('Google API key not found. Skipping translation.');
      return text;
    }
    
    const url = "https://translation.googleapis.com/language/translate/v2";
    const response = await axios.post(url, null, {
      params: {
        q: text,
        target: targetLang,
        format: 'text',
        key: apiKey
      }
    });
    
    return response.data.data.translations[0].translatedText;
  } catch (error) {
    console.error('Translation error:', error.message);
    // Return original text if translation fails
    return text;
  }
}

// Function to check if text might not be in English
function mightNotBeEnglish(text) {
  // Simple heuristic: check for non-ASCII characters
  return /[^\x00-\x7F]/.test(text);
}

// POST /api/v1/files/conversion
// Converts Excel file to JSONL with translation
router.post('/conversion', async (req, res, next) => {
  try {
    // Debug request information
    console.log('Headers:', req.headers);
    console.log('Files:', req.files ? Object.keys(req.files) : 'No files');
    console.log('Body keys:', Object.keys(req.body));
    
    // Check if file was uploaded
    if (!req.files || !req.files.file) {
      console.error('No file uploaded or file field missing');
      console.log('Request files object:', req.files);
      return res.status(400).json({ 
        success: false, 
        message: 'No file uploaded or file field missing in the request' 
      });
    }
    
    const file = req.files.file;
    console.log('File received:', file.name, 'Size:', file.size, 'bytes');
    
    // Check if it's an Excel file
    if (!file.name.endsWith('.xlsx')) {
      return res.status(400).json({ 
        success: false, 
        message: 'Only .xlsx files are supported' 
      });
    }
    
    // Create unique filenames
    const timestamp = Date.now();
    const excelPath = path.join(__dirname, '..', 'temp', `${timestamp}_${file.name}`);
    const jsonlPath = path.join(__dirname, '..', 'temp', `${timestamp}_${file.name.replace('.xlsx', '.jsonl')}`);
    
    // Ensure temp directory exists
    if (!fs.existsSync(path.join(__dirname, '..', 'temp'))) {
      fs.mkdirSync(path.join(__dirname, '..', 'temp'), { recursive: true });
    }
    
    // Save the Excel file temporarily
    await file.mv(excelPath);
    console.log('Excel file saved at:', excelPath);
    
    try {
      // Parse Excel file
      const workbook = XLSX.readFile(excelPath);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(worksheet);
      console.log(`Parsed ${data.length} rows from Excel file`);
      
      // Open a write stream for the JSONL file
      const jsonlStream = fs.createWriteStream(jsonlPath);
      
      // Process each row
      let processedRows = 0;
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        
        // Check for required fields
        if (!row.conversationId && !row.conversation_id) {
          console.log(`Skipping row ${i+1} - missing conversationId`);
          continue; // Skip rows without an ID
        }
        
        // Extract fields and handle different possible column names
        const conversationId = row.conversationId || row.conversation_id || i + 1;
        let conversation = row.conversation || '';
        const agent = row.Agent || row.agent || '';
        const timestamp = row.timestamp || new Date().toISOString();
        const sourceIntent = row.source_intent || row.sourceIntent || '';
        
        // Always translate conversation to ensure it's in English
        if (conversation) {
          console.log(`Translating conversation in row ${i+1}`);
          conversation = await translateText(conversation);
        }
        
        // Create item object
        const item = {
          item: {
            conversationId: conversationId,
            conversation: conversation,
            Agent: agent,
            timestamp: timestamp,
            source_intent: sourceIntent
          }
        };
        
        // Write to JSONL file
        jsonlStream.write(JSON.stringify(item) + '\n');
        processedRows++;
      }
      
      // Close the stream
      jsonlStream.end();
      
      // Wait for stream to finish
      await new Promise((resolve) => jsonlStream.on('finish', resolve));
      console.log(`JSONL file created with ${processedRows} rows`);
      
      // Read the JSONL file
      const jsonlContent = fs.readFileSync(jsonlPath);
      console.log('JSONL file size:', jsonlContent.length, 'bytes');
      
      // Delete temporary files
      await unlinkAsync(excelPath);
      await unlinkAsync(jsonlPath);
      console.log('Temporary files deleted');
      
      // Send the converted file
      res.setHeader('Content-Type', 'application/jsonl');
      res.setHeader('Content-Disposition', `attachment; filename=${file.name.replace('.xlsx', '.jsonl')}`);
      return res.send(jsonlContent);
    } catch (error) {
      console.error('Error processing Excel file:', error);
      // Clean up the Excel file if it exists
      if (fs.existsSync(excelPath)) {
        await unlinkAsync(excelPath).catch(err => console.error('Error deleting Excel file:', err));
      }
      throw new Error(`Error processing Excel file: ${error.message}`);
    }
  } catch (error) {
    console.error('Conversion error:', error);
    next(error);
  }
});

module.exports = router; 