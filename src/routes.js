import Knex from './knex'
import jwt from 'jsonwebtoken'
var moment = require('moment')
const config = require('./config')
const bcrypt = require('bcrypt')
var generator = require('generate-password')
var fs = require('fs')
var excelToJson = require('convert-excel-to-json')
const nodemailer = require('nodemailer')
var _ = require('underscore-node')
var request = require('request')


const routes = [
  /* USERS */
  // authentication
  {
    path: '/auth',
    method: 'POST',
    handler: (request, reply) => {
      const { username, password } = request.payload
      Knex('users').where({username}).select('password', 'name', 'email', 'mobile').then(([user]) => {
        if (!user) {
          reply({
            error: true,
            errMessage: 'the specified user was not found'
          })
          return
        }

        bcrypt.compare(password, user.password, function (err, res) {
          if (err) {
            reply({success: false, error: 'Password verify failed'})
          }
          if (res) {
            const token = jwt.sign(
              {username}, 'vZiYpmTzqXMp8PpYXKwqc9ShQ1UhyAfy', {
                algorithm: 'HS256',
                expiresIn: '24h'
              })

            reply({
              success: 'true',
              token: token,
              name: user.name,
              email: user.email,
              mobile: user.mobile
            })
          } else {
            reply({success: false, error: 'incorrect password'})
          }
        })
      }).catch((err) => {
        reply('server-side error' + err)
      })
    }
  },

  // Forget Password
  {
    path: '/forget',
    method: 'POST',
    handler: (request, reply) => {
      const { username } = request.payload
      Knex('users').where({username}).then(([user]) => {
        if (!user) {
          reply({
            success: false,
            message: `Specified user doesn't exist`
          })
          return
        }

        let newPassword = generator.generate({
          length: 5,
          numbers: false
        })

        bcrypt.hash(newPassword, 10, function (err, hash) {
          if (err) {
            reply({success: false, error: 'Password hashing failed, please contact Administrator'})
          }
          if (hash) {
            Knex('users')
              .where('username', '=', username)
              .update({
                password: hash
              }).then(count => {
              if (count) {
                const to = user.mobile
                const msg = 'Your new password at Mitsuba is ' + newPassword

                // send sms
                if (to && msg) {
                  const url = 'http://login.smsmoon.com/API/sms.php'
                  const body = {
                    'username': 'raghuedu',
                    'password': 'abcd.1234',
                    'from': 'RAGHUT',
                    'to': to,
                    'msg': msg,
                    'type': '1',
                    'dnd_check': '0'
                  }

                  request.post(url, {
                    form: body
                  }, function (error, response, body) {
                    if (!error && response.statusCode == 200) {
                      // console.log(body) // Print the google web page.

                      reply({
                        success: true,
                        message: 'Password update successful' + hash
                      })
                    } else {
                      reply({
                        success: false,
                        message: 'Password update successful, but sending SMS failed. Contact Administrator'
                      })
                    }
                  })
                }
              } else {
                reply({
                  success: false,
                  message: 'Password update failed'
                })
              }
            })
          } else {
            // no hash generated
            reply('No hash generated, please contact administrator')
          }
        })
      }).catch((err) => {
        reply('server-side error' + err)
      })
    }
  },

  // Profile
  {
    path: '/profile',
    method: 'GET',
    config: {
      auth: {
        strategy: 'token'
      }
    },
    handler: (request, reply) => {
      let data = {username: request.auth.credentials.username}
      Knex('users').select('username', 'name', 'mobile', 'email').where(data).then((results) => {
        if (!results || results.length === 0) {
          reply({
            error: true,
            errMessage: 'no users found'
          })
        }

        reply({
          success: true,
          data: results
        })
      }).catch((err) => {
        reply('server-side error' + err)
      })
    }
  },

  // Change Profile
  {
    path: '/update_profile',
    method: 'POST',
    config: {
      auth: {
        strategy: 'token'
      }
    },
    handler: (request, reply) => {
      const { name, email, mobile, new_password, old_password } = request.payload
      let username = request.auth.credentials.username

      Knex('users').select('password').where({username}).then(([user]) => {
        if (!user) {
          reply({
            success: false,
            message: `Specified user doesn't exist`
          })
          return
        }

        if ((old_password || new_password) && !(old_password && new_password)) {
          reply({
            success: false,
            message: `Both Current Password and New Password are required`
          })
          return
        }

        if (old_password && new_password) {
          if (!bcrypt.compareSync(old_password, user.password)) {
            reply({
              success: false,
              message: `Incorrect Password`
            })
            return
          }
        }

        let data = {}
        if (name) {
          data['name'] = name
        }
        if (email) {
          data['email'] = email
        }
        if (mobile) {
          data['mobile'] = mobile
        }
        if (new_password) {
          data['password'] = bcrypt.hashSync(new_password, 10)
        }

        Knex('users')
          .where('username', '=', username)
          .update(data).then(count => {
          if (count) {
            reply({
              success: true,
              message: 'Profile update successful'
            })
          } else {
            reply({
              success: false,
              message: 'Password update failed'
            })
          }
        })
      }).catch((err) => {
        reply('server-side error' + err)
      })
    }
  },

  /* Roster */
  {
    path: '/upload_schedule',
    method: 'POST',
    config: {
      auth: {
        strategy: 'token'
      },
      payload: {
        output: 'stream',
        parse: true,
        allow: 'multipart/form-data'
      },

      handler: function (request, reply) {
        var data = request.payload
        if (data.file) {
          var name = data.file.hapi.filename
          var path = config.UPLOAD_FOLDER + name
          var currentTime = moment().format('YYYYMMDDHHmmss')
          var newPath = path + '-' + currentTime

          var file = fs.createWriteStream(newPath)

          file.on('error', function (err) {
            console.error(err)
          })

          data.file.pipe(file)

          data.file.on('end', function (err) {
            if (err) {
              reply({
                success: false,
                message: 'File upload failed'
              })
            }

            // var ret = {
            //   filename: data.file.hapi.filename,
            //   headers: data.file.hapi.headers
            // }

            // prepare data to be inserted into db
            let result = excelToJson({
              sourceFile: newPath
            })

            if (!result) {
              reply({
                success: false,
                message: 'Cannot read excel file'
              })
            }

            var shifts = []
            // var dept = ''
            result.Sheet1.forEach(row => {
              // proceed only if first column is a number, i.e. employee code
              if (!isNaN(row.A)) {
                // if (row.C) {
                //   dept = row.C
                // }

                if (row.A && row.B && row.C && row.D && row.E && row.F && row.G && row.H && row.G.toString().indexOf('-') !== -1 && row.H.toString().indexOf('-') !== -1) {
                  shifts.push({
                    emp_code: row.A.toString().trim(),
                    name: row.B.toString().trim(),
                    dept: row.C.toString().trim(),
                    designation: row.D.toString().trim(),
                    emp_type: row.E.toString().trim(),
                    shift: row.F.toString().trim(),
                    shift_from: row.G.toString().trim(),
                    shift_to: row.H.toString().trim()
                  })
                }
              }
            })

            console.log(shifts.length)

            if (shifts.length) {
              insertOrUpdate(Knex, 'shifts', shifts).then((res) => {
                reply({
                  success: true
                })
              }).catch((err) => {
                reply({
                  success: false,
                  error: err.message
                })
              })
            } else {
              console.log('not here')
              reply({
                success: false,
                error: 'No data imported, please check if the file is in correct format'
              })
            }
          })
        } else {
          reply({
            success: false,
            message: 'No data'
          })
        }
      }
    }
  },

  // Shift Schedule
  {
    path: '/shift_schedule',
    method: 'POST',
    config: {
      auth: {
        strategy: 'token'
      }
    },
    handler: (request, reply) => {
      const { date } = request.payload

      if (!date) {
        reply({
          success: false,
          message: 'Date is a mandatory parameter'
        })
      }

      let query = Knex.raw(`select emp_code, name, designation, shift, shift_from, shift_to, dept from shifts where shift_from <= '${date}' and shift_to >= '${date}' order by emp_code`)

      // console.log(query)

      query.then((results) => {
        if (!results || results[0].length === 0) {
          reply({
            success: false,
            errMessage: 'no data found'
          })
        } else {
          reply({
            success: true,
            dataCount: results[0].length,
            data: results[0]
          })
        }
      }).catch((err) => {
        reply('server-side error' + err)
      })
    }
  },

  /* Dashboard - status */
  {
    path: '/status',
    method: 'GET',
    handler: (request, reply) => {
      var params = request.query
      var tm = params.tm
      var to = params.to
      var dept = params.dept
      var query

      // if dept is presnt, insrt values into table for email creation
      // CHANGE CLOSED TO 1 AFTER CODING IS DONE
      // console.log('dept is', dept)
      // console.log('tm is', tm)

      if (dept) {
        console.log(`in dept, ${tm}`)
        var today = moment().format("YYYY-MM-DD")
        var origtime = tm;
        tm = today + ' ' + tm
        var tm6 = today + ' 06:00:00'
        var tm14 = today + ' 14:00:00'
        var tm830 = today + ' 08:30:00'
        var tm1730 = today + ' 17:30:00'
        var tm1415 = today + ' 14:15:00'
        var tm22 = today + ' 22:00:00'
        var tm18 = today + ' 18:00:00'

        var deptq = `insert into email(dt, tm, deptname, shift, emp_type, present, expected) (SELECT current_date as dt, '${origtime}' as tm, s.dept, s.shift, s.emp_type, count(d.emp_code) as present, if(s.shift = 'A' and time_to_sec('${tm}') >=  time_to_sec('${tm6}') and time_to_sec('${tm}') <=  time_to_sec('${tm14}'),(select count(*) from shifts where dept = s.dept and shift=s.shift and emp_type = s.emp_type group by dept, shift, emp_type limit 1),if(s.shift = 'G' and time_to_sec('${tm}') >=  time_to_sec('${tm830}') and time_to_sec('${tm}') <=  time_to_sec('${tm1730}'),(select count(*) from shifts where dept = s.dept and shift=s.shift and emp_type = s.emp_type group by dept, shift, emp_type limit 1),if(s.shift = 'B' and time_to_sec('${tm}') >=  time_to_sec('${tm1415}') and time_to_sec('${tm}') <=  time_to_sec('${tm22}'),(select count(*) from shifts where dept = s.dept and shift=s.shift and emp_type = s.emp_type group by dept, shift, emp_type limit 1), if(s.shift = 'E' and time_to_sec('${tm}') >=  time_to_sec('${tm18}'),(select count(*) from shifts where dept = s.dept and shift=s.shift and emp_type = s.emp_type group by dept, shift, emp_type limit 1),if(s.shift = 'C' and time_to_sec('${tm}') >=  time_to_sec('${tm22}'),(select count(*) from shifts where dept = s.dept and shift=s.shift and emp_type = s.emp_type group by dept, shift, emp_type limit 1), 0))))) as expected FROM shifts s left join data d on d.emp_code = s.emp_code  where out_time is null group by s.dept, s.shift, s.emp_type order by dept)`


        console.log(deptq)
        Knex.raw(deptq).then(result => {

          reply({
            success: true,
          result})
        })
      }

      // used for sms
      if (tm) {
        // var smsq = Knex.raw(`SELECT data.shift, count(data.shift) as present, if (data.shift = 'a' and '${tm}' >= '06:00' and '${tm}' <= '14:00', (select count(*) as total from shifts where shift=data.shift group by shift), if (data.shift = 'g' and '${tm}' >= '08:30' and '${tm}' <= '17:30', (select count(*) as total from shifts where shift=data.shift group by shift),if (data.shift = 'b' and '${tm}' >= '14:00' and '${tm}' <= '22:00', (select count(*) as total from shifts where shift=data.shift group by shift),if (data.shift = 'e' and '${tm}' >= '18:00', (select count(*) as total from shifts where shift=data.shift group by shift),if (data.shift = 'c' and '${tm}' >= '22:00', (select count(*) as total from shifts where shift=data.shift group by shift), 0))))) as expected FROM data WHERE closed = 0 and (dt = CURRENT_DATE or dt = subdate(current_date, 1)) and in_time <= '${tm}' and out_time is null group by data.shift`)

        var today = moment().format("YYYY-MM-DD")
        // tm = today + ' ' + tm
        var tm6 = today + ' 06:00:00'
        var tm14 = today + ' 14:00:00'
        var tm830 = today + ' 08:30:00'
        var tm1730 = today + ' 17:30:00'
        var tm1415 = today + ' 14:15:00'
        var tm22 = today + ' 22:00:00'
        var tm18 = today + ' 18:00:00'


        // important: and time_to_sec(d.in_time) <= time_to_sec('${tm}')

        var smsquery = (`SELECT s.shift, count(d.emp_code) as present, if(s.shift = 'A' and time_to_sec('${tm}') >=  time_to_sec('${tm6}') and time_to_sec('${tm}') <=  time_to_sec('${tm14}'),(select count(*) from shifts where shift=s.shift), if(s.shift = 'G' and time_to_sec('${tm}') >=  time_to_sec('${tm830}') and time_to_sec('${tm}') <=  time_to_sec('${tm1730}'),(select count(*) from shifts where shift=s.shift), if(s.shift = 'B' and time_to_sec('${tm}') >=  time_to_sec('${tm14}') and time_to_sec('${tm}') <=  time_to_sec('${tm22}'),(select count(*) from shifts where shift=s.shift), if(s.shift = 'E' and time_to_sec('${tm}') >=  time_to_sec('${tm18}'),(select count(*) from shifts where shift=s.shift), if(s.shift = 'C' and time_to_sec('${tm}') >=  time_to_sec('${tm22}'),(select count(*) from shifts where shift=s.shift), 0))))) as expected FROM shifts s left join data d on d.emp_code = s.emp_code  where out_time is null group by s.shift order by shift, dept`)

        console.log('sms', smsquery)
        
        var smsq = Knex.raw(smsquery)
        var message = ''

        smsq.then(result => {
          if (result[0].length) {
            result[0].forEach(item => {
              message += item.shift + ' - ' + item.present + '/' + item.expected + '     '
            })
            if (message) {
              message = tm + ': ' + message.substr(0, message.length - 2)
              if (!to) {
                // 
                to = '9885721144,9703400284,8500373704,9441604400,9491273518'
              }
              if (to && message) {
                Knex('sms').insert({mobile: to, message: message}).then(result => {
                  // console.log(result)
                })
                // console.log(`SMS sent: ${to}, ${message}`)
                var request2 = require('request')
                const url = 'http://login.smsmoon.com/API/sms.php'
                const body = {
                  'username': 'raghuedu',
                  'password': 'abcd.1234',
                  'from': 'RAGHUT',
                  'to': to,
                  'msg': message,
                  'type': '1',
                  'dnd_check': '0'
                }

                console.log('sms:', message)
              request2.post(url, {
                form: body
              }, function (error, response, body) {
                if (!error && response.statusCode == 200) {
                  console.log(body) // Print the google web page.
                  reply({
                    success: true,
                    data: 'SMS sent successfully'
                  })
                }
              })
              } else {
                reply({
                  success: false,
                  error: 'Sending SMS failed'
                })
              }
            }
          }
        })
      }

      if (!dept && !tm) {
        
        /*
        query = Knex.raw(`SELECT shifts.dept as deptname, data.shift, count(data.shift) as present, 
        if (data.shift = 'a' and current_time >= '06:00' and current_time < '14:00', (select count(*) as total from shifts where shift=data.shift and dept=deptname and shifts.shift_from <= CURRENT_DATE and shifts.shift_to >= CURRENT_DATE), 
        if (data.shift = 'g' and current_time >= '08:30' and current_time < '17:30', (select count(*) as total from shifts where shift=data.shift  and dept=deptname and shifts.shift_from <= CURRENT_DATE and shifts.shift_to >= CURRENT_DATE),
        if (data.shift = 'b' and current_time >= '14:00' and current_time < '22:00', (select count(*) as total from shifts where shift=data.shift and dept=deptname and shifts.shift_from <= CURRENT_DATE and shifts.shift_to >= CURRENT_DATE ),
        if (data.shift = 'e' and current_time >= '18:00' and current_time < '02:00', (select count(*) as total from shifts where shift=data.shift  and dept=deptname and shifts.shift_from <= CURRENT_DATE and shifts.shift_to >= CURRENT_DATE),
        if (data.shift = 'c' and current_time >= '22:00' and current_time < '06:00', (select count(*) as total from shifts where shift=data.shift  and dept=deptname and shifts.shift_from <= CURRENT_DATE and shifts.shift_to >= CURRENT_DATE), 0))))) as expected FROM data 
        inner join shifts on shifts.emp_code = data.emp_code and shifts.shift_from <= CURRENT_DATE and shifts.shift_to >= CURRENT_DATE
        WHERE closed = 0 and (dt = CURRENT_DATE or dt = subdate(current_date, 1)) and out_time is null and shifts.shift_from <= CURRENT_DATE and shifts.shift_to >= CURRENT_DATE group by data.shift, shifts.dept order by shift asc,present desc,expected desc`)
        */

        query = Knex.raw(`select shifts.dept as deptname, shifts.shift, count(*) as expected, count(data.emp_code) as present from shifts left join data on data.out_time is null and data.emp_code = shifts.emp_code where shift_from <= current_date and shift_to >= current_date group by shifts.dept, shifts.shift order by shifts.shift, present, shifts.dept`)

        
        


        query.then((result) => {
          if (result[0].length) {
            reply({
              success: true,
              update_tm: moment().format("YYYY-MM-DD HH:mm"),
              data: result[0]
            })
          } else {
            reply({
              success: false,
              message: 'No data found'
            })
          }
        })
      }
    }
  },

  // ////////////////////
  /* Admin */
  // Insert data

  // Temp Inserts
  {
    path: '/cron',
    method: 'GET',
    config: {
      handler: (request, reply) => {
  
        var today = moment(new Date()).format('YYYY-MM-DD') + ' '
        var yesterday = moment(new Date()).add(-1, 'days').format('YYYY-MM-DD') + ' '

        var arr = [
          {emp_code:'10001',time: yesterday + '05:55'},
          {emp_code:'10002',time: yesterday + '08:30'},
          {emp_code:'10003',time: yesterday + '08:20'},
          {emp_code:'10004',time: yesterday + '06:00'},
          {emp_code:'10005',time: yesterday + '14:15'},
          {emp_code:'10006',time: yesterday + '22:50'},
          {emp_code:'10007',time: yesterday + '05:20'},
          {emp_code:'10008',time: yesterday + '19:30'},
          {emp_code:'10009',time: yesterday + '13:30'},
          {emp_code:'10010',time: yesterday + '06:15'},
          {emp_code:'10011',time: yesterday + '17:30'},
          {emp_code:'10012',time: yesterday + '05:30'},
          {emp_code:'10013',time: yesterday + '08:38'},
          {emp_code:'10014',time: yesterday + '08:38'},
          {emp_code:'10015',time: yesterday + '22:15'},
          {emp_code:'10016',time: yesterday + '05:30'},
          {emp_code:'10017',time: yesterday + '18:15'},
          {emp_code:'90000',time: yesterday + '06:15'},
          {emp_code:'90000',time: yesterday + '08:45'},
          {emp_code:'90000',time: yesterday + '14:15'},
          {emp_code:'90000',time: yesterday + '18:15'},
          {emp_code:'90000',time: yesterday + '22:15'},
        ];

        var tempout = [
          {emp_code:'10001',time: yesterday + '14:20'},
          {emp_code:'10002',time: yesterday + '17:30'},
          {emp_code:'10003',time: yesterday + '17:15'},
          {emp_code:'10004',time: yesterday + '14:25'},
          {emp_code:'10005',time: yesterday + '22:00'},
          {emp_code:'10006',time: today + '05:30'},
          {emp_code:'10007',time: yesterday + '15:00'},
          {emp_code:'10008',time: today + '05:55'},
          {emp_code:'10009',time: yesterday + '22:30'},
          {emp_code:'10010',time: yesterday + '13:30'},
          {emp_code:'10011',time: today + '03:00'},
          {emp_code:'10012',time: yesterday + '15:00'},
          {emp_code:'10013',time: yesterday + '17:30'},
          {emp_code:'10014',time: yesterday + '17:45'},
          {emp_code:'10015',time: today + '07:00'},
          {emp_code:'10016',time: yesterday + '19:30'},
          {emp_code:'10017',time: today + '06:30'}
        ];


        var final = []
        arr.forEach(item => {
          var tm = item.time
          if (tm.length == 4) {
            tm = '0' + tm
          }
          
          // final.push({emp_code: item.emp_code, time: moment(new Date()).add(-1, 'days').format('YYYY-MM-DD') + ' ' + tm})

          final.push({emp_code: item.emp_code, time: tm})


        })

        tempout.forEach(item => {   
          var tm = item.time
          if (tm.length == 4) {
            tm = '0' + tm
          }
          final.push({emp_code: item.emp_code, time: tm})
          
          // if (moment(moment(new Date()).add(-1, 'days').format('YYYY-MM-DD') + ' ' + item).isSameOrBefore(moment(moment(new Date()).add(-1, 'days').format('YYYY-MM-DD') + ' 8:59').format('YYYY-MM-DD HH:MM'))) {
          //   final.push({emp_code: item.emp_code, time: moment().format('YYYY-MM-DD') + ' ' + tm})
          // } else
          // {            
          //   final.push({emp_code: item.emp_code, time: moment(new Date()).add(-1, 'days').format('YYYY-MM-DD') + ' ' + tm})
          // }
        }
        )
        var totalsort = _.sortBy(final, function (o) {
          // let dt = '2017-08-31 ' + o.time

          // let dt = moment(new Date()).add(-1, 'days').format('YYYY-MM-DD')
          
          //   if (moment(moment(new Date()).add(-1, 'days').format('YYYY-MM-DD') + ' ' + o.time).isSameOrBefore('2017-08-31 06:00')) {
          //     dt = moment().format('YYYY-MM-DD')
          //   }

          //   dt = dt + ' ' + o.time

          // return moment(o.time).format('YYYY-MM-DD HH:MM')
          return o.time
        })

        // console.log('ts', totalsort.length)

        var requests_made = 0

        // console.log('total = ', total.count)

        // console.log(totalsort)

        totalsort.forEach(function (driver, index) {
          if (driver.emp_code == '10947') {
            console.log('10947', driver)
          }

          if (requests_made == 0) {
            // createUser(data)
            process(driver, index)
          } else {
            if (driver.time != '') {
            setTimeout(function () {
              // createUser(data)
              process(driver, index)
            }, 50 * index)
          } else {
            console.log('not inserted', driver)
          }
        }
          requests_made++
        })



        // var currentTime = moment().format('HH:mm')
        // console.log('cron - ', currentTime)
        // var currentTime = '17:00'

        // var temp = total.filter(item => item.time == currentTime)
        // var temp = arr.filter(item => moment(moment().format("YYYY-MM-DD") + ' ' + item.time).isSameOrBefore(moment()))
        // var temp = tempout.filter(item => moment(moment().format("YYYY-MM-DD") + ' ' + item.time).isSameOrBefore("2017-08-30 15:30"))
        // var temp = tempout




        reply({
          currentTime,
        temp})
      }
    }
  },

  {
    path: '/clear',
    method: 'GET',
    handler: (request, reply) => {
      Knex.raw("truncate table data").then(result => {
        Knex.raw("truncate table email").then(result => {
          Knex.raw("truncate table sms").then(result => {
            reply({
              success: true,
              message: 'Data cleared'
            })
          })
        })
      })
    }
  },

  // auto close
  {
    path: '/autoclose',
    method: 'GET',
    handler: (request, reply) => {
      var type = request.query.type
      var query = `update data set closed = 1 where (shift = 'A' or shift = 'G' or shift = 'B') and closed = 0`
      if (type == 2) {
        query = `update data set closed = 1 where (shift = 'E' or shift = 'C') and closed = 0`
      }
      Knex.raw(query).then(result => {
        reply({
          success: true,
          data: result
        })
      })
    }
  },

  /* Mail */
  {
    path: '/mail',
    method: 'GET',
    handler: (request, reply) => {
      // console.log('in mail method')
      // create reusable transporter object using the default SMTP transport
      var transporter = nodemailer.createTransport({
        host: 'mail.akrivia.in',
        port: 465,
        secure: true, // true for 465, false for other ports
        auth: {
          user: 'testmail@akrivia.in',
          pass: 'Aeiou@123'
        },
        tls: { rejectUnauthorized: false }
      })

      var message = ''
      let query = Knex.raw(`select * from email where dt = subdate(current_date, 1) and (expected > 0 or present > 0) order by deptname, tm `)

      // console.log('in mail')

      query.then((results) => {
        if (!results || results[0].length === 0) {
          message = 'No data found'
          reply({
            success: false,
            message: 'No data found'
          })
        } else {
          var data = results[0]
          console.log('data is', data)

          var types = ['Direct', 'Indirect']
          types.forEach(type => {
            var t = data.filter(function (item) { console.log(item); return item.emp_type === type })
            var depts = _.uniq(_.pluck(t, 'deptname'))
            // console.log('departments are', depts)
            var currentDepartment = null

            message += `<h3>${type}</h3><table style="width:100%">
                <tr>
                <th>Date</th>
                <th style="background-color:#676767;color:#fff;width:5px;" colspan="6"> Shift A<br> (report taken at 06:15)</th>
                <th style="background-color:#676767;width:5px;color:#fff" colspan="6"> Shift G <br>(report taken at 08:45) </th>
                <th style="background-color:#676767;width:5px;color:#fff" colspan="6"> Shift B <br>(report taken at 14:15) </th>
                <th style="background-color:#676767;width:5px;color:#fff" colspan="6"> Shift E <br>(report taken at 18:15) </th>
                <th style="background-color:#676767;width:5px;color:#fff" colspan="6">Shift C <br>(report taken at 22:15) </th>
    
                </tr>
        
                <tr>
                <th></th>
                <th style="
                font-size: 15px;
                font-weight: 700;
                width:5px;
                color: #020202;
                background: #34efaa;">A</th>
                <th style="
                font-size: 15px;
                font-weight: 700;
                width: 5px; color: #020202;
                background: #34efaa;"> G </th>
                <th style="
                font-size: 15px;
                font-weight: 700;
                width:5px;color: #020202;
                background: #34efaa;"> B</th>
                <th style="
               
                font-size: 15px;
                font-weight: 700;
                width:5px;color: #020202;
                background: #34efaa;"> E </th>
                <th style="
                
                 font-size: 15px;
                 font-weight: 700;
                 width:5px;color: #020202;
                 background: #34efaa;"> C </th>
                 <th style="
                 
                  font-size: 15px;
                  font-weight: 700;
                  width:5px;color: #020202;
                  background: #09888e;">SC</th>
                <!-- 2nd th -->
                <th style="
                font-size: 15px;
                font-weight: 700;
                width:5px;
                color: #020202;
                background: #34efaa;">A</th>
                <th style="
                font-size: 15px;
                font-weight: 700;
                width: 5px; color: #020202;
                background: #34efaa;"> G </th>
                <th style="
                font-size: 15px;
                font-weight: 700;
                width:5px;color: #020202;
                background: #34efaa;"> B</th>
                <th style="
               
                font-size: 15px;
                font-weight: 700;
                width:5px;color: #020202;
                background: #34efaa;"> E </th>
                <th style="
               
                font-size: 15px;
                font-weight: 700;
                width:5px;color: #020202;
                background: #34efaa;"> C </th>
                <th style="
                
                 font-size: 15px;
                 font-weight: 700;
                 width:5px;color: #020202;
                 background: #09888e;">SC</th>
    
                <!-- 3nd th -->
                <th style="
                font-size: 15px;
                font-weight: 700;
                width:5px;
                color: #020202;
                background: #34efaa;">A</th>
                <th style="
                font-size: 15px;
                font-weight: 700;
                width: 5px; color: #020202;
                background: #34efaa;"> G </th>
                <th style="
                font-size: 15px;
                font-weight: 700;
                width:5px;color: #020202;
                background: #34efaa;"> B</th>
                <th style="
               
                font-size: 15px;
                font-weight: 700;
                width:5px;color: #020202;
                background: #34efaa;"> E </th>
                <th style="
               
                font-size: 15px;
                font-weight: 700;
                width:5px;color: #020202;
                background: #34efaa;"> C </th>
    
                <th style="
                
                 font-size: 15px;
                 font-weight: 700;
                 width:5px;color: #020202;
                 background: #09888e;">SC</th>
                <!-- 4th th -->
                <th style="
                font-size: 15px;
                font-weight: 700;
                width:5px;
                color: #020202;
                background: #34efaa;">A</th>
                <th style="
                font-size: 15px;
                font-weight: 700;
                width: 5px; color: #020202;
                background: #34efaa;"> G </th>
                <th style="
                font-size: 15px;
                font-weight: 700;
                width:5px;color: #020202;
                background: #34efaa;"> B</th>
                <th style="
               
                font-size: 15px;
                font-weight: 700;
                width:5px;color: #020202;
                background: #34efaa;"> E </th>
                <th style="
               
                font-size: 15px;
                font-weight: 700;
                width:5px;color: #020202;
                background: #34efaa;"> C </th>
                <th style="
                
                 font-size: 15px;
                 font-weight: 700;
                 width:5px;color: #020202;
                 background: #09888e;">SC</th>
                <!-- 5th th -->
                   <th style="
                font-size: 15px;
                font-weight: 700;
                width:5px;
                color: #020202;
                background: #34efaa;">A</th>
                <th style="
                font-size: 15px;
                font-weight: 700;
                width: 5px; color: #020202;
                background: #34efaa;"> G </th>
                <th style="
                font-size: 15px;
                font-weight: 700;
                width:5px;color: #020202;
                background: #34efaa;"> B</th>
                <th style="
               
                font-size: 15px;
                font-weight: 700;
                width:5px;color: #020202;
                background: #34efaa;"> E </th>
                <th style="
               
                font-size: 15px;
                font-weight: 700;
                width:5px;color: #020202;
                background: #34efaa;"> C </th>
                <th style="
                
                 font-size: 15px;
                 font-weight: 700;
                 width:5px;color: #020202;
                 background: #09888e;">SC</th>
            </tr>`
            
            
  
            depts.forEach(dept => {
              if (dept == currentDepartment) {
                message += `<tr>`
              } else {
                currentDepartment = dept
                message += `<tr><td align="center" width="5px">${dept}</td>`
              }
  
              let timings = ['06:15:00', '08:45:00', '14:15:00', '18:15:00', '22:15:00']
              timings.forEach(time => {
                // message += `<td>${time}</td>`
  
                // console.log('abc', dept, time)
  
                var a = _.filter(t, function (num) {return num.deptname == dept && num.tm == time.substr(0,8) && num.shift == 'A'})
                var b = _.filter(t, function (num) {return num.deptname == dept && num.tm == time.substr(0,8) && num.shift == 'B'})
                var c = _.filter(t, function (num) {return num.deptname == dept && num.tm == time.substr(0,8) && num.shift == 'C'})
                var e = _.filter(t, function (num) {return num.deptname == dept && num.tm == time.substr(0,8) && num.shift == 'E'})
                var g = _.filter(t, function (num) {return num.deptname == dept && num.tm == time.substr(0,8) && num.shift == 'G'})
  
                var total = 0;
                var expected = 0;
                
  
                if(time == '06:15:00') {
                  if (a[0] && a[0].present) {message += `<td align="center" style="background: #e21b1b;color:#fff">${a[0].present}</td>`; total += parseInt(a[0].present); expected = a[0].expected} else {message += `<td align="center" style="background: #e21b1b;color:#fff"></td>`}
                  if (g[0] && g[0].present) { message += `<td align="center" style="background: #ab6712;color:#fff">${g[0].present}</td>`; } else {message += `<td align="center" style="background: #ab6712;color:#fff"></td>`}
                  if (b[0] && b[0].present) { message += `<td align="center" style="background: #ab6712;color:#fff">${b[0].present}</td>`; } else {message += `<td align="center" style="background: #ab6712;color:#fff"></td>`}
                  if (e[0] && e[0].present) { message += `<td align="center" style="background: #ab6712;color:#fff">${e[0].present}</td>`; } else {message += `<td align="center" style="background: #ab6712;color:#fff"></td>`}
                  if (c[0] && c[0].present) { message += `<td align="center" style="background: #ab6712;color:#fff">${c[0].present}</td>`; } else {message += `<td align="center" style="background: #ab6712;color:#fff"></td>`}
                  message += `<td align="center" style="background: #09888e;color:#fff">${total}/${expected}</td>`
                }
  
  
                if(time == '08:45:00') {
                  if (a[0] && a[0].present) { message += `<td align="center" style="background: #ab6712;color:#fff">${a[0].present}</td>`; } else {message += `<td align="center" style="background: #ab6712;color:#fff"></td>`}                
                  if (g[0] && g[0].present) {message += `<td align="center" style="background: #e21b1b;color:#fff">${g[0].present}</td>`; total += parseInt(g[0].present); expected = g[0].expected} else {message += `<td align="center" style="background: #e21b1b;color:#fff"></td>`}
                  if (b[0] && b[0].present) { message += `<td align="center" style="background: #ab6712;color:#fff">${b[0].present}</td>`; } else {message += `<td align="center" style="background: #ab6712;color:#fff"></td>`}
                  if (e[0] && e[0].present) { message += `<td align="center" style="background: #ab6712;color:#fff">${e[0].present}</td>`; } else {message += `<td align="center" style="background: #ab6712;color:#fff"></td>`}
                  if (c[0] && c[0].present) { message += `<td align="center" style="background: #ab6712;color:#fff">${c[0].present}</td>`; } else {message += `<td align="center" style="background: #ab6712;color:#fff"></td>`}
                  message += `<td align="center" style="background: #09888e;color:#fff">${total}/${expected}</td>`
                }    
                
                if(time == '14:15:00') {
                  if (a[0] && a[0].present) { message += `<td align="center" style="background: #ab6712;color:#fff">${a[0].present}</td>`; } else {message += `<td align="center" style="background: #ab6712;color:#fff"></td>`}                
                  if (g[0] && g[0].present) { message += `<td align="center" style="background: #ab6712;color:#fff">${g[0].present}</td>`; } else {message += `<td align="center" style="background: #ab6712;color:#fff"></td>`}
  
                  if (b[0] && b[0].present) {message += `<td align="center" style="background: #e21b1b;color:#fff">${b[0].present}</td>`; total += parseInt(b[0].present); expected = b[0].expected} else {message += `<td align="center" style="background: #e21b1b;color:#fff"></td>`}
  
                  if (e[0] && e[0].present) { message += `<td align="center" style="background: #ab6712;color:#fff">${e[0].present}</td>`; } else {message += `<td align="center" style="background: #ab6712;color:#fff"></td>`}
                  if (c[0] && c[0].present) { message += `<td align="center" style="background: #ab6712;color:#fff">${c[0].present}</td>`; } else {message += `<td align="center" style="background: #ab6712;color:#fff"></td>`}
                  message += `<td align="center" style="background: #09888e;color:#fff">${total}/${expected}</td>`
                } 
  
  
                if(time == '18:15:00') {
                  if (a[0] && a[0].present) { message += `<td align="center" style="background: #ab6712;color:#fff">${a[0].present}</td>`; } else {message += `<td align="center" style="background: #ab6712;color:#fff"></td>`}                
                  if (g[0] && g[0].present) { message += `<td align="center" style="background: #ab6712;color:#fff">${g[0].present}</td>`; } else {message += `<td align="center" style="background: #ab6712;color:#fff"></td>`}
  
                
  
                  if (b[0] && b[0].present) { message += `<td align="center" style="background: #ab6712;color:#fff">${b[0].present}</td>`; } else {message += `<td align="center" style="background: #ab6712;color:#fff"></td>`}
  
                  if (e[0] && e[0].present) {message += `<td align="center" style="background: #e21b1b;color:#fff">${e[0].present}</td>`; total += parseInt(e[0].present); expected = e[0].expected} else {message += `<td align="center" style="background: #e21b1b;color:#fff"></td>`}
  
                  if (c[0] && c[0].present) { message += `<td align="center" style="background: #ab6712;color:#fff">${c[0].present}</td>`; } else {message += `<td align="center" style="background: #ab6712;color:#fff"></td>`}
                  message += `<td align="center" style="background: #09888e;color:#fff">${total}/${expected}</td>`
                } 
  
                if(time == '22:15:00') {
                  if (a[0] && a[0].present) { message += `<td align="center" style="background: #ab6712;color:#fff">${a[0].present}</td>`; } else {message += `<td align="center" style="background: #ab6712;color:#fff"></td>`}                
                  if (g[0] && g[0].present) { message += `<td align="center" style="background: #ab6712;color:#fff">${g[0].present}</td>`; } else {message += `<td align="center" style="background: #ab6712;color:#fff"></td>`}
              
                  if (b[0] && b[0].present) { message += `<td align="center" style="background: #ab6712;color:#fff">${b[0].present}</td>`; } else {message += `<td align="center" style="background: #ab6712;color:#fff"></td>`}
  
  
                  if (e[0] && e[0].present) { message += `<td align="center" style="background: #ab6712;color:#fff">${e[0].present}</td>`; } else {message += `<td align="center" style="background: #ab6712;color:#fff"></td>`}
  
                  if (c[0] && c[0].present) {message += `<td align="center" style="background: #e21b1b;color:#fff">${c[0].present}</td>`; total += parseInt(c[0].present); expected = c[0].expected} else {message += `<td align="center" style="background: #e21b1b;color:#fff"></td>`}
  
                  message += `<td align="center" style="background: #09888e;color:#fff">${total}/${expected}</td>`
                } 
  
              })
              message += `</tr>`
              
            })
            message += `</table>`
          })


         
          // console.log('email message is', message)

var html = `<!DOCTYPE html>
  <html>

  <head>
    <style>
        table,
        th,
        td {
            border: 1px solid black;
            border-collapse: collapse;
        }
    </style>
  </head>

  <body>
   

${message}
</body></html>`


          // setup email data with unicode symbols
          var mailOptions = {
            from: '"Vijay" <vijay.m@akrivia.in>', // sender address
            to: 'vijay.m@akrivia.in', // list of receivers
            subject: 'Mitsuba - End of Day Report', // Subject line
            text: 'Mitsuba - End of Day Report', // plain text body
            html: html

          }

          transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
              return console.log(error)
            }
            console.log('Message sent: %s', info.messageId)
          })

          reply({
            success: true,
          message})
        }
      }).catch((err) => {
        reply('server-side error' + err)
      })
    }
  }
]

function insertOrUpdate (knex, tableName, data) {
  const firstData = data[0] ? data[0] : data
  return knex.raw(knex(tableName).insert(data).toQuery() + ' ON DUPLICATE KEY UPDATE ' +
    Object.getOwnPropertyNames(firstData).map((field) => `${field}=VALUES(${field})`).join(',  '))
}

function sms (to, message) {
  if (to && msg) {
    var request = require('request')
    const url = 'http://login.smsmoon.com/API/sms.php'
    const body = {
      'username': 'raghuedu',
      'password': '`abcd.1234`',
      'from': 'RAGHUT',
      'to': to,
      'msg': msg,
      'type': '1',
      'dnd_check': '0'
    }

    request.post(url, {
      form: body
    }, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        console.log(body) // Print the google web page.
        reply({
          success: true,
          data: 'SMS sent successfully'
        })
      }
    })
  } else {
    reply({
      success: false,
      error: 'Sending SMS failed'
    })
  }
}

function process (item, index) {
  // if (item.emp_code == '00013') {
  //   console.log('00013', item)
  // }
  // if (item.emp_code == '10947') {
  //   console.log('10947', item)
  // }

  var yesterday = moment(new Date()).add(-1, 'days').format('YYYY-MM-DD')
console.log(item.time)
  // console.log(index)


  let empCode = item.emp_code
  let tm = item.time
  console.log(`parse ${empCode} ${tm}`)
  let dt = moment(new Date()).add(-1, 'days').format('YYYY-MM-DD')

  if (moment(moment(new Date()).add(-1, 'days').format('YYYY-MM-DD') + ' ' + item.time).isSameOrBefore(dt + ' 05:00')) {
    dt = moment().format('YYYY-MM-DD')
  }

  // let query = Knex.raw(`select * from data where emp_code = '${empCode}'  and dt = '${dt}' `)
  let query = Knex.raw(`select * from data where emp_code = '${empCode}'  and closed = 0 `)
  query.then(results => {
    // console.log('results are', results[0].length)
    if (!results[0].length) {

      // shift calculation
      Knex.raw(`select * from shifts where emp_code = '${empCode}' and shift_from <= '${dt}' and shift_to >= '${dt}' `).then(results => {
        var shift = 'NA'
        if (results[0].length) {
          var shift = results[0][0]['shift']
        }

        // if (shift == 'A' || shift == 'G') {
        Knex.raw(`insert into data(emp_code, in_time, shift, dt) values('${empCode}', '${tm}', '${shift}', '${dt}')`).then(result => {
          // console.log('insert ', result)
        })
      // }
      // } else {
      //   console.error('shift not found', empCode)
      // }
      })
    } else {
      let query = `update data set out_time = '${tm}' where emp_code = '${empCode}' and closed = 0;`
      let shift = results[0].shift

      if (shift == 'E' || shift == 'C') {
        dt = moment().add(-1, 'days').format('YYYY-MM-DD')
        query = `update data set out_time = '${tm}' where emp_code = '${empCode}' and dt = '${dt}';`
      }

      Knex.raw(query).then(result => {
        // console.log('shift is ', shift, ' update ', result)
      })
    }
  })




  if (item.time == `${yesterday} 06:15`) {
    request.get('http://localhost:7879/status?tm=06:15:00&dept=1', null, function (error, response, body) {})
  }

  if (item.time == `${yesterday} 08:45`) {
    request.get('http://localhost:7879/status?tm=08:45:00&dept=1', null, function (error, response, body) {})
  }

  if (item.time == `${yesterday} 14:15`) {
    request.get('http://localhost:7879/status?tm=14:15:00&dept=1', null, function (error, response, body) {})
  }

  if (item.time == `${yesterday} 18:15`) {
    request.get('http://localhost:7879/status?tm=18:15:00&dept=1', null, function (error, response, body) {})
  }

  if (item.time == `${yesterday} 22:15`) {
    request.get('http://localhost:7879/status?tm=22:15:00&dept=1', null, function (error, response, body) {})
  }
}

export default routes
