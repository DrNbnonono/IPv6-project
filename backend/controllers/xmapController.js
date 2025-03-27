const { exec} = require('child_process');
const { error } = require('console');
const { stdout } = require('process');

exports.scan = (req, res) => {
    
    //解析请求体内容
    const {
        ipv6,
        ipv4,
        maxlen,

        rate,
        targetPort,
        targetaddress,

        help
    } = req.body;

    //构建 xmap 命令
    let commend = 'sudo xmap';

    if (ipv6){
        commend += ` -6`;
    }else if (ipv4){
        commend += ` -4`;
    }

    if (maxlen){
        commend += ` -m ${maxlen}`;
    }

    if (rate){
        commend += ` -B ${rate}`;
    }

    if (targetPort){
        commend += ` -p ${targetPort}`;
    }

    if (targetaddress){
        commend += ` -a ${targetaddress}`;
    }

    if(help){
        commend += ` -h`;
    }

    exec(commend, (error, stdout, stderr) => {
        if (error){
            console.error(`执行错误: ${error.message}`)
            return res.status(500).send({error: '命令出错'});
        }

        if (stderr){
            console.error(`输出错误: ${stderr}`)
            return res.status(500).send({error: '命令出错'});
        }

        res.status(200).send({message: '命令执行成功', data: stdout});
    });
};