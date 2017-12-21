describe('tests temperature functions', function() {
    describe('#when requested', function() {

        before(function() {
            return global.initAllAsync()
                .then(function () {
                    return global.useShadowConfigFileAsync('/specs/assets/config/templates/config_vanilla.json')
                })
        })

        beforeEach(function() {
            sandbox = sinon.sandbox.create()
            loggers = setupLoggerStubOrSpy(sandbox, 'stub', 'spy')
        })

        afterEach(function() {
            sandbox.restore()

        })

        after(function() {
            return global.removeShadowConfigFileAsync()
                .then(function(){
                    return global.stopAllAsync()
                })
        })





        it('#decodes temperature packet from the controller', function(done) {
            Promise.resolve()
                .then(function(){

                    tempPkt = [255,0,255,165,33,15,16,8,13,51,51,58,70,92,0,0,0,55,0,0,0,0,2,115]
                    temps = bottle.container.temperatures.getTemperatures()
                    temps.temperature.poolTemp.should.equal(0)
                    bottle.container.packetBuffer.push(new Buffer(tempPkt))
                })
                .delay(50)
                .then(function(){
                    temps = bottle.container.temperatures.getTemperatures()
                    temps.temperature.poolTemp.should.equal(51)
                })
                .then(done,done)

        })

        it('returns temps in a JSON', function() {
            return global.requestPoolDataWithURLAsync('temperature').then(function(obj) {
                obj.temperature.poolTemp.should.equal(51);
            })

        });

    })
})