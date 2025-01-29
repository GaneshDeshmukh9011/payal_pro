const mongoose=require("mongoose");

const messageSchema=new mongoose.Schema({
    studentId:String,
    messageId:String,
    senderId:String,
    senderName:String,
    subject:String,
    body:String
});


const message=mongoose.model('messages',messageSchema);


module.exports=message;