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

// Function to fetch all annotations page by page
async function fetchAllAnnotations(evalId, evalRunId, testId) {
  console.log(`Fetching annotations for evalId: ${evalId}, runId: ${evalRunId}, testId: ${testId}`);
  
  const allAnnotations = [];
  let after = null;
  const limit = 100;
  let hasMore = true;
  
  while (hasMore) {
    try {
      // Construct URL with 'after' parameter if available
      let url = `http://localhost:8080/v1/evals/${evalId}/runs/${evalRunId}/tests/${testId}/annotations?order=asc&limit=${limit}`;
      if (after) {
        url += `&after=${after}`;
      }
      
      console.log(`Fetching page with URL: ${url}`);
      
      // Make the API call
      const response = await axios.get(url);
      const data = response.data;
      
      // If we got results
      if (data && Array.isArray(data) && data.length > 0) {
        console.log(`Received ${data.length} annotations`);
        allAnnotations.push(...data);
        
        // Get the ID of the last item for pagination
        after = data[data.length - 1].id;
      } else {
        // No more results
        hasMore = false;
        console.log('No more annotations to fetch');
      }
      
      // If we received fewer items than the limit, we've reached the end
      if (data.length < limit) {
        hasMore = false;
      }
    } catch (error) {
      console.error('Error fetching annotations:', error.message);
      hasMore = false;
    }
  }
  
  console.log(`Fetched a total of ${allAnnotations.length} annotations`);
  return allAnnotations;
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

// POST /api/v1/files/export
// Fetches annotations from external API and exports them as Excel
router.post('/export', async (req, res, next) => {
  try {
    console.log('Export request received:', req.body);
    
    // Validate request body
    const { evalId, evalRundId, testId } = req.body;
    
    if (!evalId || !evalRundId || !testId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: evalId, evalRundId, or testId'
      });
    }
    
    // Fetch all annotations from the external API
    const annotations = await fetchAllAnnotations(evalId, evalRundId, testId);
    
    if (annotations.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No annotations found'
      });
    }
    
    // Process annotations into the required format
    const processedData = annotations.map(annotation => {
      // Get values from annotation, handle both original and overridden values
      const attrs = annotation.annotationAttributes || {};
      const overrideAttrs = annotation.overriddenAnnotationAttributes || {};
      
      return {
        // Use overridden values if they exist, otherwise use original values
        conversationId: attrs.conversationId || '',
        conversation: attrs.conversation || '',
        label_level1: overrideAttrs.handover_reason_l1 || attrs.handover_reason_l1 || '',
        label_level2: overrideAttrs.handover_reason_l2 || attrs.handover_reason_l2 || '',
        Reason: attrs.label_selection_reason || ''
      };
    });
    
    // Create a worksheet from the processed data
    const worksheet = XLSX.utils.json_to_sheet(processedData);
    
    // Create a workbook and add the worksheet to it
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Annotations');
    
    // Create temp directory if it doesn't exist
    if (!fs.existsSync(path.join(__dirname, '..', 'temp'))) {
      fs.mkdirSync(path.join(__dirname, '..', 'temp'), { recursive: true });
    }
    
    // Generate a unique filename
    const timestamp = Date.now();
    const fileName = `annotations_export_${timestamp}.xlsx`;
    const filePath = path.join(__dirname, '..', 'temp', fileName);
    
    // Write the workbook to a file
    XLSX.writeFile(workbook, filePath);
    console.log(`Excel file created at: ${filePath}`);
    
    // Send the file as the response
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    
    // Stream the file to the response
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
    // Delete the file after sending
    fileStream.on('end', async () => {
      try {
        await unlinkAsync(filePath);
        console.log(`Temporary file deleted: ${filePath}`);
      } catch (error) {
        console.error(`Error deleting temporary file: ${error.message}`);
      }
    });
    
  } catch (error) {
    console.error('Export error:', error);
    next(error);
  }
});

module.exports = router; 