import * as React from 'react';

import { capitalize } from 'lodash';
import { Option } from 'react-select';
import { $q } from 'ngimport';
import { IPromise } from 'angular';

import { Observable, Subject } from 'rxjs';

import { IBuild, IBuildInfo, IBuildTrigger } from 'core/domain';
import { ITriggerTemplateComponentProps } from 'core/pipeline/manualExecution/TriggerTemplate';
import { IgorService, BuildServiceType } from 'core/ci';
import { Spinner } from 'core/widgets/spinners/Spinner';
import { buildDisplayName } from 'core/pipeline/executionBuild/buildDisplayName.filter';
import { timestamp } from 'core/utils/timeFormatters';
import { TetheredSelect } from 'core/presentation/TetheredSelect';

export interface IBaseBuildTriggerTemplateProps extends ITriggerTemplateComponentProps {
  buildTriggerType: BuildServiceType;
  optionRenderer?: (build: Option) => JSX.Element;
}

export interface IBaseBuildTriggerTemplateState {
  builds?: IBuild[];
  buildsLoading?: boolean;
  loadError?: boolean;
  selectedBuild?: number;
}

export class BaseBuildTriggerTemplate extends React.Component<
  IBaseBuildTriggerTemplateProps,
  IBaseBuildTriggerTemplateState
> {
  private destroy$ = new Subject();

  public static formatLabel(trigger: IBuildTrigger): IPromise<string> {
    return $q.when(`(${capitalize(trigger.type)}) ${trigger.master}: ${trigger.job}`);
  }

  public constructor(props: IBaseBuildTriggerTemplateProps) {
    super(props);
    this.state = {
      builds: [],
      buildsLoading: false,
      loadError: false,
      selectedBuild: 0,
    };
  }

  private buildLoadSuccess = (allBuilds: IBuild[]) => {
    const newState: Partial<IBaseBuildTriggerTemplateState> = {
      buildsLoading: false,
    };

    const trigger = this.props.command.trigger as IBuildTrigger;
    newState.builds = allBuilds
      .filter(build => !build.building && build.result === 'SUCCESS')
      .sort((a, b) => b.number - a.number);
    if (newState.builds.length) {
      // default to what is supplied by the trigger if possible; otherwise, use the latest
      const defaultSelection = newState.builds.find(b => b.number === trigger.buildNumber) || newState.builds[0];
      newState.selectedBuild = defaultSelection.number;
      this.updateSelectedBuild(defaultSelection);
    }

    this.setState(newState);
  };

  private buildLoadFailure = () => {
    this.setState({
      buildsLoading: false,
      loadError: true,
    });
  };

  private updateSelectedBuild = (item: any) => {
    this.props.command.extraFields.buildNumber = item.number;
    this.props.command.triggerInvalid = false;
    this.setState({ selectedBuild: item.number });
  };

  private initialize = () => {
    const { command } = this.props;
    command.triggerInvalid = true;
    const trigger = command.trigger as IBuildTrigger;

    // These fields will be added to the trigger when the form is submitted
    command.extraFields = {};

    this.setState({
      buildsLoading: true,
      loadError: false,
    });

    if (trigger.buildNumber) {
      this.updateSelectedBuild(trigger.buildInfo);
    }

    // do not re-initialize if the trigger has changed to some other type
    if (trigger.type !== this.props.buildTriggerType) {
      return;
    }

    Observable.fromPromise(IgorService.listBuildsForJob(trigger.master, trigger.job))
      .takeUntil(this.destroy$)
      .subscribe(this.buildLoadSuccess, this.buildLoadFailure);
  };

  public componentDidMount() {
    this.initialize();
  }

  public componentWillUnmount(): void {
    this.destroy$.next();
  }

  public componentWillReceiveProps(nextProps: ITriggerTemplateComponentProps) {
    if (nextProps.command !== this.props.command) {
      this.initialize();
    }
  }

  private handleBuildChanged = (option: Option): void => {
    this.updateSelectedBuild({ number: option.number });
  };

  private optionRenderer = (build: Option) => {
    return (
      <span style={{ fontSize: '13px' }}>
        <strong>Build {build.number} </strong>
        {buildDisplayName(build as IBuildInfo)}({timestamp(build.timestamp)})
      </span>
    );
  };

  public render() {
    const { builds, buildsLoading, loadError, selectedBuild } = this.state;

    return (
      <div className="form-group">
        <label className="col-md-4 sm-label-right">Build</label>
        {buildsLoading && (
          <div className="col-md-6">
            <div className="form-control-static text-center">
              <Spinner size={'small'} />
            </div>
          </div>
        )}
        {loadError && <div className="col-md-6">Error loading builds!</div>}
        {!buildsLoading && (
          <div className="col-md-6">
            {builds.length === 0 && (
              <div>
                <p className="form-control-static">No builds found</p>
              </div>
            )}
            {builds.length > 0 && (
              <TetheredSelect
                options={builds}
                valueKey="number"
                optionRenderer={this.props.optionRenderer ? this.props.optionRenderer : this.optionRenderer}
                clearable={false}
                value={selectedBuild}
                valueRenderer={this.props.optionRenderer ? this.props.optionRenderer : this.optionRenderer}
                onChange={this.handleBuildChanged}
              />
            )}
          </div>
        )}
      </div>
    );
  }
}
