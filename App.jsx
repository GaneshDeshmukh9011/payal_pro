// client/src/App.jsx
import React, { useState } from 'react';
import { BrowserRouter as Router, Route, Routes, Link } from 'react-router-dom';
import Add from './components/Add';
import First from './components/First';
import Display from './components/displayRecords';
import DisplayFile from './components/displayFile';
import CustomFile from './components/customFile';
import Sidebar from './components/sidebar';
import CustomExcelFile from './components/customExcelFile';
import CustomExcelFileHtml from './components/customWordFileHtml';
import CustomExcelFileEditor from './components/customWordFileEditor';
import ComposeMail from './components/composeMail';
import Login from './components/login';
import Register from './components/register';
import Receiver from './components/receiver';
import MessageData from './components/messageData';

function App() {
  const [activeNav,setActivenav]=useState(parseInt(localStorage.getItem('activeNav'),10) || 1);
  const [isLogin,setLogin]=useState(localStorage.getItem("isLogin"));
  const [role,setUserRole]=useState(localStorage.getItem('role'));
  const [userLogData,setUserLogData]=useState({});
  const handleanotherClick=(nav)=>{
    setActivenav(nav);
    localStorage.setItem('activeNav',nav)
  }

  const userLogin=()=>{
    setLogin("1");
  }

  const userLogout=()=>{
    setLogin("0");
    localStorage.setItem('isLogin',"0");
  }

  return (
    <Router>
      <div className='h-screen w-screen'>
        <header className='w-full border-b flex justify-between h-[10%]'>  
            <div className='w-[70%] py-2 px-14 font-medium text-xl flex items-center text-green-700'><Link>notify<span className='text-blue-500'>Ease</span></Link></div>
            {isLogin === "1" ? <div className='flex w-[30%] justify-around items-center p-2 font-medium'>
                <Link to="/" onClick={()=>{handleanotherClick(1)}} className={`${activeNav === 1 ? "border-b-2" :""} border-blue-500 rounded-lg p-2`}><div>Home</div></Link>
                {role === "admin" ? <Link to="/addRecord" onClick={()=>{handleanotherClick(2)}} className={`${activeNav === 2 ? "border-b-2" :""} border-blue-500 rounded-lg p-2`}><div>Add Record</div></Link>: ""}
                <Link className='px-3 py-1 bg-blue-600 text-white rounded-md'><div onClick={userLogout}>Log Out</div></Link>
            </div>: ""}
        </header>

        <main className='w-full h-[90%] flex'>
        {isLogin === "1" && role==="admin" ? 
            <div className='h-full w-[18%] flex flex-col border'>
                <Routes>
                  <Route path='*' element={<Sidebar />}/>
                </Routes>
            </div> : ""}
               
            <div className={`h-full ${isLogin === "1" && role==="admin" ? "w-[82%]" : "w-[100%]"}`}>
                  <Routes>
                    {
                      isLogin === "1" ? 
                        <>
                          {
                            role ==="admin" ?
                            <>
                              <Route path="/" element={<First />} /> 
                              <Route path="/addRecord" element={<Add />} />
                              <Route path="/displayRecords" element={<Display />} />
                              <Route path="/:academicYear/:year/:branch/:fileName" element={<DisplayFile edit={false}/>} />
                              <Route path="/editFile/:academicYear/:year/:branch/:fileName" element={<DisplayFile edit={true}/>} />
                              <Route path="/customFile" element={<CustomFile />} />
                              <Route path="/customExcelFile" element={<CustomExcelFile />} />
                              <Route path="/customWordFileHtml" element={<CustomExcelFileHtml />} />
                              <Route path="/customWordFileEditor" element={<CustomExcelFileEditor />} />
                              <Route path="/composeMail" element={<ComposeMail />} />
                            </>
                            :
                            <>
                              <Route path="/" element={<Receiver userLogData={userLogData} />} />
                              <Route path="/emailData/:messageId/:studentId" element={<MessageData />} />
                            </>
                            
                          }
                          
                        </>

                      : <Route path="*" element={<Login userLogin={userLogin} setUserRole={setUserRole} setUserLogData={setUserLogData} />}></Route>
                    }
                    <Route path="/register" element={<Register />}></Route>
                  </Routes>
            </div>
        </main>
      </div>
    </Router>
  );
}
export default App;