const { Pool } = require('pg');
const { getPrimaryKeys, getForeignKeys } = require('./newDummyD/foreign_key_info')

// Initialize to a default db.
// URI Format: postgres://username:password@hostname:port/databasename
let PG_URI: string = 'postgres://postgres:postgres@localhost:5432/defaultDB';
let pool: any = new Pool({ connectionString: PG_URI });

//helper function that creates the column objects, which are saved to the schemaLayout object
//this function returns a promise to be resolved with Promise.all syntax
const getColumnObjects = (tableName: string) => {
  const queryString = "SELECT column_name, data_type, character_maximum_length FROM information_schema.columns WHERE table_name = $1;";
  const value = [tableName];
  return new Promise ((resolve) => {
    pool
      .query(queryString, value)
      .then((result) => {
        const columnInfoArray: any = [];
        for (let i = 0; i < result.rows.length; i++) {
          const columnObj: any = {
            columnName: result.rows[i].column_name,
            dataInfo: {
              data_type: result.rows[i].data_type,
              character_maxiumum_length: result.rows[i].character_maxiumum_length
            }
          }
          columnInfoArray.push(columnObj)
        }
        resolve(columnInfoArray);
      })
  })
}

const getDBNames = () => {
  return new Promise((resolve) =>{
    pool
      .query('SELECT datname FROM pg_database;')
      .then((databases) => {
        let dbList: any = [];
          for (let i = 0; i < databases.rows.length; ++i) {
            let curName = databases.rows[i].datname;
            if (curName !== 'postgres' && curName !== 'template0' && curName !== 'template1')
              dbList.push(databases.rows[i].datname);
          }
          resolve(dbList);
      })
  })
}

const getDBLists = () => {
  return new Promise((resolve) => {
    pool
      .query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
      )
      .then((tables) => {
        let tableList: any = [];
        for (let i = 0; i < tables.rows.length; ++i) {
          tableList.push(tables.rows[i].table_name);
        }
        resolve(tableList);
      })
  })
}

module.exports = {

  query: (text, params, callback) => {
    console.log('Executed query: ', text);
    return pool.query(text, params, callback);
  },

  changeDB: (dbName: string) => {
    PG_URI = 'postgres://postgres:postgres@localhost:5432/' + dbName;
    pool = new Pool({ connectionString: PG_URI });
    console.log('Current URI: ', PG_URI);
    return dbName;
  },

  getLists: () => {
    return new Promise((resolve) => {
      const listObj: any = {
        tableList: [], // current database's tables
        databaseList: [],
      };
      Promise.all([getDBNames(), getDBLists()])
        .then((data) => {
          console.log('models: ', data);
          listObj.databaseList = data[0];
          listObj.tableList = data[1];
          resolve(listObj);
        })
      })
    },

    
  createKeyObject: (dummyDataRequest) => {
    return new Promise ((resolve) => {
      // initialize the keyObject we eventually want to return out
      const keyObject: any  = {};
      pool
        .query(getPrimaryKeys, null)
        .then((result) => {
          let table;
          let pkColumn
          // iterate over the primary key table, adding info to our keyObject
          for (let i = 0; i < result.rows.length; i++) {
            table = result.rows[i].table_name;
            pkColumn = result.rows[i].pk_column;
            // if the table is not yet initialized within the keyObject, then initialize it
            if (!keyObject[table]) keyObject[table] = {primaryKeyColumns: {}, foreignKeyColumns: {}};
            // then just set the value at the pk column name to true for later checking
            keyObject[table].primaryKeyColumns[pkColumn] = true;
            }
          })
        .then(() => {
          pool
            .query(getForeignKeys, null)
            .then((result) => {
              let table;
              let primaryTable;
              let fkColumn;
              // iterate over the foreign key table, adding info to our keyObject
              for (let i = 0; i < result.rows.length; i++) {
                table = result.rows[i].foreign_table;
                primaryTable = result.rows[i].primary_table
                fkColumn = result.rows[i].fk_column;
                // if the table is not yet initialized within the keyObject, then initialize it
                if (!keyObject[table]) keyObject[table] = {primaryKeyColumns: {}, foreignKeyColumns: {}};
                // then set the value at the fk column name to the number of rows asked for in the primary table to which it points
                keyObject[table].foreignKeyColumns[fkColumn] = dummyDataRequest.dummydata[primaryTable];
                }
                resolve(keyObject);
            })
        })
    })
  },

  getSchemaLayout: () => {
    // initialize a new promise; we resolve this promise at the end of the last async function within the promise
    return new Promise((resolve) => {
      const schemaLayout: any = {
        tableNames: [],
        tables: {
          // tableName: [columnObj array]
        }
      };
      pool
        // This query returns the names of all the tables in the database
        .query(
          "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
        )
        // then we save the table names into the schemaLayout object in the tableNames property
        .then((tables) => {
          for (let i = 0; i < tables.rows.length; ++i) {
            schemaLayout.tableNames.push(tables.rows[i].table_name);
          }
          const promiseArray: any = [];
          for (let tableName of schemaLayout.tableNames) {
            promiseArray.push(getColumnObjects(tableName))
          }
          //we resolve all of the promises for the data info, and are returned an array of column data objects
          Promise.all(promiseArray)
            .then((columnInfo) => {
              //here, we create a key for each table name and assign the array of column objects to the corresponding table name
              for (let i = 0; i < columnInfo.length; i++) {
                schemaLayout.tables[schemaLayout.tableNames[i]] = columnInfo[i];
              }
              resolve(schemaLayout);
            })
        })
        .catch(() => {
          console.log('error in models.ts')
        })
    });
  }
}