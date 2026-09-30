const UID =
    process.env.UID ||
    '64363832613336322d383066342d346264652d393437352d386465326666363239633438';

const PORT =
    Number(
        process.env.PORT || 3000
    );

module.exports = {
    UID,
    PORT
};
