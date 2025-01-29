const mongoose=require('mongoose');

const publicKeySchema=new mongoose.Schema({
    id:String,
    email:String,
    publicKey:String,
    rollno:String,
    email:String,
});

const newPublicKey=mongoose.model('newPublicKey',publicKeySchema);

module.exports=newPublicKey