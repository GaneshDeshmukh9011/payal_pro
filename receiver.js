const mongoose=require('mongoose');

const receiverSchema=new mongoose.Schema({
    id:String,
    username:String,
    email:String,
    academicYear:String,
    year:String,
    branch:String,
    password:String,
    secret_key:String,
    role:String,
});


const receiver=mongoose.model('receiver',receiverSchema);

module.exports=receiver;