const fs = require("fs");
const path = require("path");
const os = require("os");
const axios = require("axios");


// ============================================================
// CONFIG
// ============================================================

const DATA_DIR =
    process.env.DATA_DIR ||
    path.join(
        os.tmpdir(),
        "website-monitor-data"
    );


const DATA_FILE =
    path.join(
        DATA_DIR,
        "monitors.json"
    );




// ============================================================
// INIT
// ============================================================


if(
    !fs.existsSync(
        DATA_DIR
    )
){

    fs.mkdirSync(
        DATA_DIR,
        {
            recursive:true
        }
    );

}



if(
    !fs.existsSync(
        DATA_FILE
    )
){

    fs.writeFileSync(
        DATA_FILE,
        "[]",
        "utf8"
    );

}




// ============================================================
// LOAD
// ============================================================


function load(){


    try{


        const data =
            fs.readFileSync(
                DATA_FILE,
                "utf8"
            );


        return JSON.parse(
            data
        );


    }
    catch(error){


        console.error(
            "[LOAD ERROR]",
            error.message
        );


        return [];


    }


}





// ============================================================
// SAVE
// ============================================================


function save(data){


    fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(
            data,
            null,
            4
        ),
        "utf8"
    );


}




// ============================================================
// ADD WEBSITE
// ============================================================


function addMonitor(config){


    const list =
        load();



    const exists =
        list.find(
            item =>
                item.name === config.name
        );



    if(exists){


        throw new Error(
            "Website already exists"
        );


    }





    const monitor = {


        id:
            Date.now(),


        name:
            config.name,


        url:
            config.url,


        interval:
            Number(
                config.interval || 300
            ),



        status:
            "unknown",



        responseTime:
            0,



        lastCheck:
            null,



        error:
            null


    };



    list.push(
        monitor
    );


    save(
        list
    );


    return monitor;


}





// ============================================================
// DELETE
// ============================================================


function deleteMonitor(name){


    let list =
        load();



    const oldLength =
        list.length;



    list =
        list.filter(
            item =>
                item.name !== name
        );



    save(
        list
    );



    return (
        list.length !== oldLength
    );


}






// ============================================================
// GET ALL
// ============================================================


function getAllMonitor(){


    return load();


}






// ============================================================
// CHECK ONE
// ============================================================


async function checkMonitor(
    monitor
){


    const start =
        Date.now();



    try{


        const response =
            await axios.get(
                monitor.url,
                {

                    timeout:
                        10000,

                    validateStatus:
                        ()=>true

                }
            );



        const time =
            Date.now()
            -
            start;



        monitor.responseTime =
            time;



        monitor.lastCheck =
            new Date()
            .toISOString();



        if(
            response.status >=200 &&
            response.status <400
        ){


            monitor.status =
                "online";


            monitor.error =
                null;


        }
        else{


            monitor.status =
                "warning";


            monitor.error =
                "HTTP "
                +
                response.status;


        }



    }
    catch(error){



        monitor.status =
            "offline";



        monitor.responseTime =
            0;



        monitor.lastCheck =
            new Date()
            .toISOString();



        monitor.error =
            error.message;



    }



}






// ============================================================
// CHECK ALL
// ============================================================


async function checkAll(){


    const list =
        load();



    if(
        list.length === 0
    ){

        return;

    }




    console.log(
        `[CHECK] ${list.length} websites`
    );




    for(
        const monitor of list
    ){


        await checkMonitor(
            monitor
        );


        console.log(
            `[${monitor.status}] ${monitor.name} ${monitor.responseTime}ms`
        );


    }



    save(
        list
    );


}





module.exports = {


    addMonitor,

    deleteMonitor,

    getAllMonitor,

    checkAll


};