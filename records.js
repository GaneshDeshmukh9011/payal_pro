const mongoose=require('mongoose');

const recordSchema=new mongoose.Schema({
    id:String,
    academicYear:String,
    year:String,
    branch:String,
    wordFile:String,
    excelFile:String
});

const newRecord=mongoose.model('newRecord',recordSchema);

module.exports=newRecord