// server/server.js
const express = require('express');
require('dotenv').config();
const path = require('path');
const mongoose=require('mongoose');
const { v4: uuidv4 } = require('uuid');
const record=require('./models/records.js');
const receiver=require('./models/receiver.js')
const sender=require("./models/sender.js");
const message=require('./models/message.js');
const newPublicKey=require('./models/publickey.js');
const { escape } = require('querystring');
const fs=require('fs').promises
const multer=require('multer');
const xlsx = require('xlsx');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const mammoth = require('mammoth');
const { htmlToText } = require('html-to-text');
const docx = require('docx');
const { Document, Packer, Paragraph, TextRun } = docx;
const nodemailer = require("nodemailer");
const { readdir } = require('fs');
const pdf = require('html-pdf');
const htmlToDocx = require('html-to-docx');
const cors=require('cors');
const {S3Client,GetObjectCommand,PutObjectCommand,ListObjectsCommand,DeleteObjectsCommand,DeleteObjectCommand,ListObjectsV2Command} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fetch = require('node-fetch'); // For making HTTP requests
const multerS3 = require('multer-s3');
const { Buffer } = require('buffer'); // To work with binary data
const stream = require('stream');
const { NodeHttpHandler } = require('@aws-sdk/node-http-handler');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { spawn } = require('child_process');
const { json } = require('stream/consumers');


const app = express();

const AWS_ACCESS_KEY=process.env.AWS_ACCESS_KEY;
const AWS_SECRET_KEY=process.env.AWS_SECRET_KEY;
const MONGODB_SECRET_KEY=process.env.MONGODB_SECRET_KEY;

app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended:true }));




// Create an S3 client with retry logic and timeout options
const s3Client = new S3Client({
  region: "eu-north-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,  // Using environment variables
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
  requestHandler: new NodeHttpHandler({
    connectionTimeout: 300000,  // 5-minute timeout
    socketTimeout: 300000,      // 5-minute socket timeout
  }),
  maxAttempts: 3, // AWS SDK will retry the request up to 3 times in case of failure
});

// Fetch data from URL
async function fetchDataFromURL(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Error fetching file: ${response.statusText}`);

    const arrayBuffer = await response.arrayBuffer(); // For binary data
    const buffer = Buffer.from(arrayBuffer);
    const result = await mammoth.convertToHtml({ buffer: buffer });
    return result.value;
  } catch (error) {
    console.error("Error fetching the file:", error);
    throw error;
  }
}

// Get presigned URL from S3
async function getObjectURL(key) {
  try {
    const command = new GetObjectCommand({
      Bucket: "notifyease1",
      Key: key,
    });
    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1-hour expiration
    return url;
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    throw error;
  }
}

// Get URL and fetch data
async function getUrl(filePath) {
  try {
    const url = await getObjectURL(filePath);
    console.log("Pre-signed URL:", url);
    const response = await fetchDataFromURL(url);
    console.log(response);
    return response;
  } catch (error) {
    console.error("Error getting URL:", error);
    throw error;
  }
}

// List files in a folder
async function listFilesFromPath(folderPath) {
  let isTruncated = true;
  let continuationToken = null;
  const fileNames = [];

  try {
    while (isTruncated) {
      const params = {
        Bucket: 'notifyease1',
        Prefix: folderPath,
        ContinuationToken: continuationToken,
      };

      const command = new ListObjectsV2Command(params);
      const data = await s3Client.send(command);

      if (data.Contents) {
        data.Contents.forEach((item) => {
          const fileName = item.Key.replace(`${folderPath}/`, "");
          if (fileName) {
            fileNames.push(fileName);
          }
        });
      }

      isTruncated = data.IsTruncated;
      continuationToken = data.NextContinuationToken;
    }

    return fileNames;
  } catch (error) {
    console.error("Error listing objects from S3:", error);
    throw error;
  }
}

// Fetch Excel file from S3
async function getExcelFileFromS3(key) {
  const command = new GetObjectCommand({
    Bucket: 'notifyease1',
    Key: key,
  });

  try {
    const response = await s3Client.send(command);
    return response.Body; // Stream returned
  } catch (error) {
    console.error('Error fetching file from S3:', error);
    throw error;
  }
}

// Fetch Word file from S3
async function getWordFileFromS3(key) {
  try {
    const command = new GetObjectCommand({
      Bucket: 'notifyease1',
      Key: key,
    });
    const response = await s3Client.send(command);
    const fileBuffer = await streamToBuffer(response.Body); // Convert stream to buffer
    return fileBuffer;
  } catch (err) {
    console.error("Error fetching file from S3:", err);
    throw err;
  }
}

// Read file from S3 and return as binary
async function readFileFromS3(key) {
  const params = {
    Bucket: 'notifyease1',
    Key: key,
  };

  try {
    const command = new GetObjectCommand(params);
    const response = await s3Client.send(command);
    const fileBuffer = await streamToBuffer(response.Body);
    return fileBuffer.toString('binary');
  } catch (err) {
    console.error("Error reading file from S3:", err);
    throw err;
  }
}

// Upload document to S3
async function uploadDocToS3(key, buffer) {
  try {
    const params = {
      Bucket: 'notifyease1',
      Key: key,
      Body: buffer,
      ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };

    const command = new PutObjectCommand(params);
    const response = await s3Client.send(command);
    console.log('Successfully uploaded file to S3:', response);
  } catch (err) {
    console.error('Error uploading file to S3:', err);
    throw err;
  }
}

// Delete all files in a specified path
async function deleteAllFilesInPath(folderPath) {
  try {
    const listParams = {
      Bucket: 'notifyease1',
      Prefix: folderPath,
    };

    const listedObjects = await s3Client.send(new ListObjectsV2Command(listParams));

    if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
      console.log('No files found in the specified path.');
      return;
    }

    const deleteParams = {
      Bucket: 'notifyease1',
      Delete: {
        Objects: listedObjects.Contents.map((file) => ({ Key: file.Key })),
        Quiet: true,
      },
    };

    const deleteResult = await s3Client.send(new DeleteObjectsCommand(deleteParams));
    console.log('Successfully deleted files:', deleteResult);
  } catch (err) {
    console.error('Error deleting files from S3:', err);
    throw err;
  }
}

// Delete a specific file from S3
async function deleteFileFromS3(filePath) {
  try {
    const params = {
      Bucket: 'notifyease1',
      Key: filePath,
    };

    const data = await s3Client.send(new DeleteObjectCommand(params));
    console.log(`File deleted successfully: ${filePath}`);
    return data;
  } catch (err) {
    console.error('Error deleting file from S3:', err);
    throw err;
  }
}

// Convert stream to buffer
async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}


const generateUniqueId = (req, res, next) => {
  req.uniqueId = uuidv4();
  next();
};

const conn=mongoose.connect(MONGODB_SECRET_KEY,{
  serverSelectionTimeoutMS: 30000, 
})


// API endpoint to get data for different components

app.get('/api/data/first', (req, res) => {
  res.json({ items: ['Component1 Item 1', 'Component1 Item 2', 'Component1 Item 3'] });
});


app.get('/api/data/second', (req, res) => {
  res.json({ items: ['Component2 Item 2', 'Component2 Item 2', 'Component2 Item 2'] });
});

app.get('/api/data/third', (req, res) => {
  res.json({ items: ['Component2 Item 1', 'Component2 Item 2', 'Component2 Item 3'] });
});

app.get('/api/data/fourth', (req, res) => {
  res.json({ items: ['Component3 Item 1', 'Component3 Item 2', 'Component3 Item 3'] });
});

// Add Record in database

// const storage = multer.diskStorage({
//   destination: async function (req, file, cb) {
//     const uploadPath = path.join(__dirname, 'public', 'student_data', `${req.body.academicYear}`, `${req.body.year}`, 'uploads', `${req.body.branch}`,`${req.uniqueId}`);
    
//     // Check if the path exists, if not create it
//     try {
//       await fs.mkdir(uploadPath, { recursive: true }); // Creates the folder if it doesn't exist
//       cb(null, uploadPath);
//     } catch (err) {
//       console.error('Error creating directory:', err);
//       cb(err); // Pass the error to multer if directory creation fails
//     }
//   },
//   filename: function (req, file, cb) {
//     cb(null, file.originalname); // or generate a unique name if needed
//   }
// });

// const upload = multer({ storage: storage }).fields([
//   { name: 'wordFile', maxCount: 1 },
//   { name: 'excelFile', maxCount: 1 }
// ]);

const upload = multer({
  storage: multerS3({
    s3: s3Client,
    bucket: 'notifyease1',
    metadata: (req, file, cb) => {
      cb(null, { fieldName: file.fieldname });
    },
    key: (req, file, cb) => {
      const uploadPath = `student_data/${req.body.academicYear}/${req.body.year}/uploads/${req.body.branch}/${req.uniqueId}`;
      const fileName = `${uploadPath}/${file.originalname}`;
      cb(null, fileName);
    },
    contentType: multerS3.AUTO_CONTENT_TYPE, // Automatically set content type
  }),
}).fields([
  { name: 'wordFile', maxCount: 1 },
  { name: 'excelFile', maxCount: 1 }
]);

function multerUpload(req, res) {
  return new Promise((resolve, reject) => {
    upload(req, res, function (err) {
      if (err) {
        reject(err);
      }
      resolve();
    });
  });
}


// + Record in database
app.post('/api/data/addRecord', generateUniqueId, async (req, res) => {
  try {
    await multerUpload(req, res); // Wait for the files to be uploaded

    const { academicYear, year, branch } = req.body;
    const result = await record.find({ academicYear: academicYear, year: year, branch: branch });

    if (result.length === 0) {
      const uniqueId = req.uniqueId;

      const wordFile = req.files['wordFile'] ? req.files['wordFile'][0].originalname : null;
      const excelFile = req.files['excelFile'] ? req.files['excelFile'][0].originalname : null;
      console.log(wordFile,excelFile);
      

      // Fetch the uploaded Excel file from S3 after the upload has completed
      const filepath = `student_data/${req.body.academicYear}/${req.body.year}/uploads/${req.body.branch}/${uniqueId}/${excelFile}`;
      console.log(filepath);
      const fileStream = await getExcelFileFromS3(filepath);

      // Process Excel file with xlsx
      const fileBuffer = await streamToBuffer(fileStream);
      const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const recipients = xlsx.utils.sheet_to_json(worksheet);
      let flag=1;
      recipients.forEach((recipient) => {
        if(recipient.branch!=branch || recipient.year!=year)
        {
          flag=0;
        }
      })
      if(flag==1)
      {
        await record.create({
          id: uniqueId,
          academicYear,
          year,
          branch,
          wordFile,
          excelFile
        });
        console.log(recipients);
          // Fetch and process the Word file
          const filepath_word = `student_data/${req.body.academicYear}/${req.body.year}/uploads/${req.body.branch}/${uniqueId}/${wordFile}`;
          const noticeDir = path.join(__dirname, 'public', 'student_data', `${req.body.academicYear}`, `${req.body.year}`, 'Notices', `${req.body.branch}`, `${uniqueId}`);

          const content = await readFileFromS3(filepath_word);

          // Create notices for each recipient
          recipients.forEach(async (recipient) => {
            try {
              const zip = new PizZip(content);
              const doc = new Docxtemplater(zip, {
                paragraphLoop: true,
                linebreaks: true,
              });

              doc.setData({
                student_name: recipient.Name,
                student_id: recipient.roll_no,
                branch: recipient.branch,
                year: recipient.year,
                pending_fees: recipient.pendingfees
              });

              try {
                doc.render();
              } catch (error) {
                console.error('Error rendering document:', error);
              }

              const buffer = doc.getZip().generate({ type: 'nodebuffer' });
              const key = `student_data/${req.body.academicYear}/${req.body.year}/Notices/${req.body.branch}/${req.uniqueId}/${recipient.roll_no}.docx`; 
              await uploadDocToS3(key, buffer);
            } catch (error) {
              console.error('Error while storing file:', error);
            }
          });
          res.redirect("/displayRecords");
      }
      else{
        res.redirect("/addRecord");
      }

    }
    
      
  } catch (error) {
    console.error('Error during file upload and processing:', error);
    res.status(500).send('An error occurred during upload');
  }
});


// Return records from database

app.get('/api/data/records',async (req,res)=>{
  try {
    const allData = await record.find({});
    res.json(allData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//Delete record from database

const deleteDirectoryRecursive =async  (dirPath) => {
  // Read the contents of the directory
  const files = await fs.readdir(dirPath);
  for (const file of files) {
    const currentPath = path.join(dirPath, file);
    const stats = await fs.stat(currentPath);
    if (stats.isDirectory()) {
      await deleteDirectoryRecursive(currentPath);
    } else {
      await fs.unlink(currentPath);
    }
  }
}

app.post('/api/data/deleteRecord/:id',async (req,res)=>{
    try{
          let id=req.params.id;
          const foundRecord=await record.findOne({id:id});
          // const dirPath=path.join(__dirname, 'public', 'student_data',`${foundRecord.academicYear}`,`${foundRecord.year}`,'Notices',`${foundRecord.branch}`,`${id}`)
          const dirPath=`student_data/${foundRecord.academicYear}/${foundRecord.year}/Notices/${foundRecord.branch}/${id}`
          console.log(dirPath);
          await deleteAllFilesInPath(dirPath);
          // await fs.rmdir(dirPath);
          await record.deleteOne({id})
          res.redirect('/displayRecords');
      }
    catch (err){
      res.status(500).json({error:err.message});
    }
});


//Retreive files from folders

const retreiveFiles=async (records)=>{
  try {
    const files={};
    
    for(let record of records){
      const filepath=`student_data/${record.academicYear}/${record.year}/Notices/${record.branch}/${record.id}`;
      const file=await listFilesFromPath(filepath);
      if (!files[record.year]) {
        files[record.year] = {};
      }
      if (!files[record.year][record.branch]) {
        files[record.year][record.branch] = [];
      }
      files[record.year][record.branch] = files[record.year][record.branch].concat(file);
    }
    return files
  } catch (err) {
    console.error('Error reading files:', err);
    throw err;  
  }
}

app.get('/api/data/retreiveFiles/:academicYear/:year/:branch',async (req,res)=>{
  const {academicYear,year,branch}=req.params;
  let records=[];
  if(year==='noYear' && branch==='noBranch')
  {
    records=await record.find({academicYear:academicYear});
  }
  else if(year==='noYear')
  {
    records=await record.find({academicYear:academicYear,branch:branch});
  }
  else if(branch==='noBranch')
  {
    records=await record.find({academicYear:academicYear,year:year});
  }
  else
  {
    records=await record.find({academicYear:academicYear,year:year,branch:branch});
  }
  if(records.length>0)
  {

    const fetchedFiles=await retreiveFiles(records);
    res.send(fetchedFiles);
  }
  else
  {
    res.json({'error':["Record Not found"]});
  }
});

//retreiveMail

// const retreiveMails=async (records)=>{
//   try {
//     let emails=[];
//     // let finalResults={};
//     for(let record of records)
//     {
//       const files= await fs.readdir(path.join(__dirname, 'public', 'student_data',`${record.academicYear}`,`${record.year}`,'Notices',`${record.branch}`,`${record.id}`));
//       const excelPath = path.join(__dirname, 'public', 'student_data', record.academicYear, record.year, 'uploads', record.branch , record.id, 'Student.xlsx');
//       const workbook = xlsx.readFile(excelPath);
//       const sheetName = workbook.SheetNames[0];
//       const worksheet = workbook.Sheets[sheetName];
//       const data = xlsx.utils.sheet_to_json(worksheet); 
//       files.map(file=>{
//         const fileNameWithoutExt = path.basename(file, path.extname(file));
//         const fileResults = data.filter(row => {
//           // Convert roll_no to string if it's not already
//           const rollNo = String(row.roll_no);

//           // Check if rollNo includes the fileNameWithoutExt
//           return rollNo && rollNo.includes(fileNameWithoutExt);
//         });
//         emails.push({
//           id:record.id,
//           name:fileResults[0].Name,
//           rollNo:fileResults[0].roll_no,
//           academicYear:record.academicYear,
//           branch:fileResults[0].branch,
//           year:fileResults[0].year,
//           email:fileResults[0].email_address
//         });
        
//       })

//     }
    
    
//     return emails;
//   } catch (err) {
//     console.error('Error reading files:', err);
//     throw err;  
//   }
// }

const retreiveMails=async (records)=>{
  try {
    let emails=[];
    // let finalResults={};
    for(let record of records)
    {
      const wordFilePath=`student_data/${record.academicYear}/${record.year}/Notices/${record.branch}/${record.id}`;
      const files=await listFilesFromPath(wordFilePath);
      console.log(files);
      const excelFilePath = `student_data/${record.academicYear}/${record.year}/uploads/${record.branch}/${record.id}/Student.xlsx`;
      const fileStream = await getExcelFileFromS3(excelFilePath);
      const fileBuffer = await streamToBuffer(fileStream);
      const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const data = xlsx.utils.sheet_to_json(worksheet);
      files.map(file=>{
        const fileNameWithoutExt = path.basename(file, path.extname(file));
        const fileResults = data.filter(row => {
          // Convert roll_no to string if it's not already
          const rollNo = String(row.roll_no);

          // Check if rollNo includes the fileNameWithoutExt
          return rollNo && rollNo.includes(fileNameWithoutExt);
        });
        emails.push({
          id:record.id,
          name:fileResults[0].Name,
          rollNo:fileResults[0].roll_no,
          academicYear:record.academicYear,
          branch:fileResults[0].branch,
          year:fileResults[0].year,
          email:fileResults[0].email_address
        });
        
      })

    }
    
    
    return emails;
  } catch (err) {
    console.error('Error reading files:', err);
    throw err;  
  }
}

app.get('/api/data/retreiveMail/:academicYear/:year/:branch',async (req,res)=>{
  const {academicYear,year,branch}=req.params;
  let records=[];
  if(year==='noYear' && branch==='noBranch')
  {
    records=await record.find({academicYear:academicYear});
  }
  else if(year==='noYear')
  {
    records=await record.find({academicYear:academicYear,branch:branch});
  }
  else if(branch==='noBranch')
  {
    records=await record.find({academicYear:academicYear,year:year});
  }
  else
  {
    records=await record.find({academicYear:academicYear,year:year,branch:branch});
  }
  if(records.length>0)
  {
    const emails=await retreiveMails(records);
    console.log(emails);
    res.send(emails);
  }
  else
  {
    res.json({'error':["Record Not found"]});
  }
});


//Display file

app.get('/api/data/:academicYear/:year/:branch/:fileName',async (req, res) => {
  const { academicYear, year, branch, fileName } = req.params;
  const foundRecord=await record.findOne({academicYear:academicYear,year:year,branch:branch});
  // const filePath = path.join(__dirname, 'public', 'student_data', academicYear, year, 'Notices', branch,`${foundRecord.id}`, fileName);
  const filePath = `student_data/${academicYear}/${year}/Notices/${branch}/${foundRecord.id}/${fileName}`;
  const text="s";
  try {
    // const fileBuffer = await fs.readFile(filePath);
    // const result = await mammoth.convertToHtml({ buffer: fileBuffer });
    // const html = result.value;

    const html = await getUrl(filePath);
    res.json({'wordContent':[html]});
  } catch (err) {
    console.error('Error processing file:', err);
    res.status(500).send('Error processing file');
  }
});


//Save edited file

app.post('/api/data/saveContent/:academicYear/:year/:branch/:fileName',async (req,res)=>{
    const {academicYear,year,branch,fileName}=req.params;
    const foundRecord=await record.findOne({academicYear:academicYear,year:year,branch:branch});
    const content=req.body.content;
    const filePath= `student_data/${academicYear}/${year}/Notices/${branch}/${foundRecord.id}/${fileName}`;
    try {
      const plainText = htmlToText(content, {
      wordwrap: 130,
      preserveNewlines: true,
      uppercaseHeadings: false,
      singleNewLineParagraphs: true, 
    });
    
    // const templatePath = path.join(__dirname, 'public','template.docx'); // Ensure this is the correct path
    // const templateContent = await fs.readFile(templatePath, 'binary');
    const templatePath=`template_file/template.docx`;
    const templateContent=await readFileFromS3(templatePath);
    const zip = new PizZip(templateContent);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

    // Set the data for the document
    doc.setData({ content: plainText });

    // Render the document
    doc.render();

    // Generate the output file as a binary buffer
    const buffer = doc.getZip().generate({ type: 'nodebuffer' });

    // Save the updated .docx file
    // await fs.writeFile(filePath, buffer);
    await uploadDocToS3(filePath, buffer);
  
      res.redirect('/');
    } catch (error) {
      console.error('Error:', error.message);
      res.status(500).send('An error occurred while processing the request.');
    }
});

//Delete File
app.get('/api/data/deleteFile/:academicYear/:year/:branch/:fileName',async (req,res)=>{
  try {
    const { academicYear, year, branch, fileName } = req.params;
    const foundRecord = await record.findOne({ academicYear, year, branch });
    if (!foundRecord) {
      return res.status(404).send('Record not found');
    }
    // const filePath = path.join(__dirname, 'public', 'student_data', academicYear, year, 'Notices', branch, foundRecord.id, fileName);
    // await fs.unlink(filePath);
    const filePath = `student_data/${academicYear}/${year}/Notices/${branch}/${foundRecord.id}/${fileName}`;
    await deleteFileFromS3(filePath);
    res.status(200).json({status:"Delete Succesfully"});
  } catch (error) {
    console.error(error);
    res.status(500).send('Error deleting file');
  }
});

//Send Mail

app.post('/api/data/sendMail',async (req,res)=>{
  const { subject,body,emails } = req.body;
  try {
      const auth = nodemailer.createTransport({
          service: "gmail",
          secure: true,
          port: 465,
          auth: {
              user: "abhishekshelar1262003@gmail.com",
              pass: "ttbr htww rimk fmrl"
          }
      });
      emails.map(async item=>{
      const wordFilePath=`student_data/${item.academicYear}/${item.year}/Notices/${item.branch}/${item.id}/${item.rollNo}.docx`;
      console.log(wordFilePath);
      const fileBuffer = await getWordFileFromS3(wordFilePath);
      // const result = await mammoth.convertToHtml({ buffer: fileBuffer });
      // const htmlContent = result.value;
      // console.log(htmlContent);
        const receiver = {
          from : "abhishekshelar1262003@gmail.com",
          to : item.email,
          subject : subject,
          text : body,
          html: `<i>${body}</i>`,
          attachments: [
            {
                filename: `${item.name}.docx`,
                content: fileBuffer
            }
          ]
        };
        let info = await auth.sendMail(receiver,(error,emailResponse)=>{
            if(error)
              console.log(error);
        });
      })

  } catch (error) {
      console.error('Error occurred:', error);
      res.status(500).send('An error occurred while processing the request.');
  }
  res.json(['ok']);
});

app.post('/api/data/saveCustomFile',async (req,res)=>{
  const { academicYear, Year, branch, filecontent } = req.body;
  const content = filecontent;

  const filePath = path.join(__dirname, 'public', 'customizeFiles', academicYear, Year, branch, 'file.docx');
  const noticeDir = path.dirname(filePath);  // Directory where the file will be saved

  try {
    // Create the directory if it doesn't exist
    // await fs.mkdir(noticeDir, { recursive: true });
    // pdf.create(filecontent).toFile(`${path.join(__dirname, 'public','output.pdf')}`, (err, res) => {
    //   if (err) return console.log(err);
    //   console.log(res); // { filename: '/path/to/output.pdf' }
    // });

    const options = {
      pageSize: 'A4',
    };

    // await fs.writeFile(filePath, docxBuffer);
    const docxBuffer = await htmlToDocx(filecontent, options);

    const desiredFileName = `${academicYear}-${Year}-${branch}.docx`;
    res.setHeader('Content-Disposition', `attachment; filename="${desiredFileName}"`);
    res.setHeader('Content-Type', 'application/docx');
    res.send(docxBuffer);
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).send('An error occurred while processing the request.');
  }
});

const GenerateKey = async (email,rollno) => {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn("python", ["./kyber_operations.py","generate_keys"]);

    let output = "";
    let errorOutput = "";

    // Collect Python stdout
    pythonProcess.stdout.on("data", (data) => {
      output += data.toString();
    });

    // Collect Python stderr (if any errors occur)
    pythonProcess.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    // Handle process completion
    pythonProcess.on("close", async (code) => {
      if (code !== 0) {
        return reject({ msg: "Failed to run Python script.", error: errorOutput });
      }

      try {
        const parsedOutput = JSON.parse(output);
        const id = uuidv4();

        // Save the public key to the database
        await newPublicKey.create({ id: id, publicKey: parsedOutput.public_key,rollno:rollno,email:email });

        console.log(parsedOutput.secret_key); // For debugging
        resolve(parsedOutput.secret_key);
      } catch (err) {
        reject({ msg: "Failed to parse Python output.", error: err.message });
      }
    });
  });
};

// Receiver Side - Register User
app.post("/api/data/registerUser", async (req, res) => {
  const data = req.body;
  const uniqueId = uuidv4();

  try {
    if (data.role === "student") {
      const secretKey = await GenerateKey(data.email,data.rollno);

      await receiver.create({
        id: data.rollno,
        role: "student",
        email: data.email,
        password: data.password,
        academicYear: data.academicYear,
        year: data.year,
        branch: data.branch,
        username: data.username,
        secret_key: secretKey,
      });
    } else if (data.role === "admin") {
      await sender.create({
        id: uniqueId,
        role: "admin",
        email: data.email,
        password: data.password,
        academicYear: data.academicYear,
        year: data.year,
        branch: data.branch,
        username: data.username,
      });
    }

    res.redirect("/login");
  } catch (err) {
    console.error("Error during registration:", err);
    res.status(500).json({ msg: "Error during registration.", error: err.message });
  }
});

//Login users

app.post('/api/data/login', async (req,res)=>{
  const data=req.body;
  
  if(data.role==="admin")
  {
    const found=await sender.findOne({email:data.email,password:data.password});
    if(found)
    {
      res.send({userData:found,status:1});
    }
    else{
      res.send({userData:null,status:0});
    }
  }
  else if(data.role==="student")
  {
    const found=await receiver.findOne({email:data.email,password:data.password});
    if(found)
    {
      res.send({userData:found,status:1});
    }
    else{
      res.send({userData:null,status:0});
    }
  }

});

//send message

app.post("/api/data/sendMessage",async (req,res)=>{
  const data=req.body;
  
  data.rollNo.map(async (item)=>{
    const id=uuidv4();
    const filePath=`student_data/${item.academicYear}/${item.year}/Notices/${item.branch}/${item.id}/${item.rollNo}.docx`;
    const fileBuffer = await getWordFileFromS3(filePath);
    const uploadPath=`attachment_file/${id}/${item.rollNo}.docx`;
    await uploadDocToS3(uploadPath, fileBuffer);

    // const fileStream = fs.createReadStream(filePath);
    await message.create({
      studentId:item.rollNo,
      messageId:id,
      subject:data.subject,
      body:data.body,
      senderId:data.senderId,
      senderName:data.senderName
    });
  })

  res.send({status:1});
  
});

//Retreive messages

app.get("/api/data/messageContent/:studentId/:messageId",async (req,res)=>{
  const {studentId,messageId}=req.params;
  const filePath=`attachment_file/${messageId}/${studentId}.docx`
  const fileBuffer = await getWordFileFromS3(filePath);
  const result = await mammoth.convertToHtml({ buffer: fileBuffer });
  const htmlContent = result.value;
  // const htmlContent = await getUrl(filePath);
  const messageContent=await message.findOne({studentId:studentId,messageId:messageId});
  res.send({messageContent:messageContent,fileContent:htmlContent});
});

app.get("/api/data/messages/:id",async (req,res)=>{
  const id = req.params.id;
  const messages=await message.find({studentId:id});
  res.send(messages);
});

//Gemini

app.get("/api/data/fileContent/:keyword",async (req,res)=>{
  const prompt=req.params.keyword;
  const genAI = new GoogleGenerativeAI('AIzaSyCyPSl8NVNnFxU3FYVjT-s8ttqlvlfNHVI');
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  console.log(prompt);

  // var myHeaders = new Headers();
  // myHeaders.append("Content-Type", "application/json");
  // var requestOptions = {
  //     method: "post",
  //     headers: myHeaders,
  //     body: JSON.stringify({"prompt":`${prompt}`})
  // };

  // const response=await fetch("https://v1.nocodeapi.com/abbyshek/chatgpt/pGNWqguJsHEnzvMl/search", requestOptions);
  // const result=await response.text();
  // console.log(result);
    
  const result = await model.generateContent(`${prompt} Note-Direct answer in html format in which the specified point should be covered 
    "title"
    "date"
    "recipient"
    "body"
    "signature" and what ever the dynamic keywords are there wrap them into {} bracket e.g {Student Name}` );
    // const actualResult=result.response.text();
    const formatResult=result.response.text().replace(/```/g, '');
    const actualResult=formatResult.replace(/html/g, '')
  // res.send(result.response);
  res.json({ content: actualResult});
  
})



// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../client/dist')));

// Serve the React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
