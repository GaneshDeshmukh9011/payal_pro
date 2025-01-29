const mongoose=require('mongoose');

const senderSchema=new mongoose.Schema({
    id:String,
    email:String,
    academicYear:String,
    year:String,
    branch:String,
    password:String,
    role:String,
    username:String
});

const sender=mongoose.model("sender",senderSchema);

module.exports=sender;